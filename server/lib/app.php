<?php
/**
 * The CalMind sync API — a dumb store with auth. The server executes no domain
 * logic: it merges opaque payloads by their clear metadata (id, type, updated,
 * deleted) and hands back its tail. All the product behavior lives in
 * packages/core, on the clients.
 *
 * Auth is bearer tokens (hashed at rest); passwords are password_hash() only —
 * nothing recoverable is stored, by design. Recovery is an emailed code.
 */

require_once __DIR__ . '/store.php';
require_once __DIR__ . '/webauthn.php';
// Built for .ics and wired to nothing for months; recipe_fetch is its first
// caller. The SSRF care in it is the reason a user-supplied URL can be
// fetched at all.
require_once __DIR__ . '/fetchurl.php';

const USERNAME_RE   = '/^[A-Za-z0-9_-]{2,20}$/';
const REC_ID_RE     = '/^[A-Za-z0-9_-]{1,64}$/';
const REC_TYPE_RE   = '/^[a-z]{1,20}$/';   // folder|section|reminder today; events, notes, habits later without a server change
const MAX_BATCH     = 500;
const MAX_PAYLOAD   = 65536;               // bytes of JSON per record

/**
 * Do a stored record and an incoming change say the same thing?
 *
 * Only `deleted` and `payload` count — `updated` is the stamp being compared
 * around this. Keys are sorted recursively first, so a client that builds the
 * same object in a different order does not read as a difference: that would
 * make every echo of an already-stored record look like a tie worth accepting,
 * bump the sequence, and re-broadcast it to every device on every sync.
 *
 * The TypeScript twin is `sameContent` in packages/core/src/sync.ts; they
 * decide the same question on the two sides of the same tie.
 */
function canon_value($v)
{
    if (is_array($v)) {
        // ksort in place on associative arrays; lists keep their order,
        // because order IS content in a list.
        $isList = array_keys($v) === range(0, count($v) - 1);
        if (!$isList) { ksort($v); }
        foreach ($v as $k => $vv) { $v[$k] = canon_value($vv); }
    }
    return $v;
}

function rec_same(array $cur, array $incoming): bool
{
    if ((bool) ($cur['deleted'] ?? false) !== !empty($incoming['deleted'])) {
        return false;
    }
    return json_encode(canon_value($cur['payload'] ?? null))
        === json_encode(canon_value($incoming['payload'] ?? null));
}
const RECOVER_TTL   = 900;                 // a code lives fifteen minutes
const RECOVER_TRIES = 5;

function app_config(): array
{
    $cfg = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
    $cfg['data_dir'] ??= getenv('CALMIND_DATA_DIR') ?: dirname(__DIR__) . '/data';
    $cfg['timezone'] ??= 'America/Chicago';
    return $cfg;
}

/**
 * The clock. The server keeps UTC unless told otherwise, and anything here
 * that asks what day it is gets this answer — so without it "today" turned
 * over at 7pm Chicago, and every date the server decided was a day early all
 * evening. Found through the widget feed, which is gone; the rule outlived it
 * because repeats and dated reads still ask. The suite learned this the same
 * way and pins the same default; the config key is the one place to move it.
 */
function app_clock(): void
{
    date_default_timezone_set((string) (app_config()['timezone'] ?? 'America/Chicago'));
}
app_clock();

function reply(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $error): never
{
    reply($status, ['ok' => false, 'error' => $error]);
}

/** One tab-separated line per action — the suite's usage-log rule: never any content. */
/**
 * One line per authenticated action — time, IP, user, action, never content.
 *
 * It grew forever. Each device polls every thirty seconds, so a phone alone
 * writes a couple of thousand lines a day and three devices keep that up
 * year after year on a host with a storage quota. Nothing read the whole
 * file, so nothing ever noticed.
 *
 * One rotation at 5MB: the current log and one previous generation, about
 * 10MB in the worst case and months of history in practice. No cron, and a
 * race is harmless — rename(2) is atomic, so a second process finds no file
 * to rotate and simply appends to the fresh one.
 */
const USAGE_LOG_MAX = 5 * 1024 * 1024;

function usage_log(array $cfg, string $action, string $user): void
{
    $tok  = fn(string $s) => preg_replace('/[^\w.@-]/', '_', $s);
    $line = date('Y-m-d H:i:s') . "\t" . $tok($_SERVER['REMOTE_ADDR'] ?? '-') . "\t" . $tok($user) . "\t" . $tok($action) . "\n";
    $path = $cfg['data_dir'] . '/usage.log';
    clearstatcache(true, $path);
    if (@filesize($path) > USAGE_LOG_MAX) {
        @rename($path, $path . '.1');
    }
    @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
}

/** Recovery codes go to the account email; without mail config they land in mail.log,
 *  which is also how the test harness reads them. */
/**
 * The reset code goes to mail.log ALWAYS and to email only if the host is
 * configured to send. That is deliberate: recover always answers ok, because
 * which usernames exist is nobody's business, so a user who never receives a
 * code cannot be told why. The log is the only place the truth can live.
 *
 * Which is why the send's own answer is now recorded. mail() returning false
 * — a refused relay, a queue that will not take it — used to be discarded, so
 * the log said a code had been issued and nothing about whether it had a
 * hope of arriving. Sean is the person who has to work that out at the point
 * where somebody cannot get in.
 */
function mail_code(array $cfg, string $email, string $code): void
{
    $how = 'log-only';
    if (!empty($cfg['send_mail'])) {
        $ok  = @mail($email, 'CalMind password reset', "Your CalMind reset code is: $code\n\nIt expires in 15 minutes.");
        $how = $ok ? 'mailed' : 'MAIL REFUSED';
    }
    $line = date('c') . "  to=$email  code=$code  $how\n";
    @file_put_contents($cfg['data_dir'] . '/mail.log', $line, FILE_APPEND | LOCK_EX);
}

// ---------------------------------------------------------------- accounts & tokens

function accounts_file(array $cfg): string { return $cfg['data_dir'] . '/accounts.json'; }
function tokens_file(array $cfg): string   { return $cfg['data_dir'] . '/tokens.json'; }
function recover_file(array $cfg): string  { return $cfg['data_dir'] . '/recover.json'; }
function lockouts_file(array $cfg): string { return $cfg['data_dir'] . '/lockouts.json'; }

/**
 * Login throttling — Sean's policy, 2026-08-18: five wrong guesses lock the
 * account, and each further lockout holds longer — 5m, 10m, 1h, 2h, 3h,
 * then another hour per round. A clean sign-in (or a password reset) clears
 * the slate. There is DELIBERATELY no endpoint that lifts one — "manually
 * disable from the backend only": delete the account's entry from
 * data/lockouts.json on the server (or the file itself) and the ladder
 * starts over. bcrypt already makes each guess slow; this bounds how many
 * guesses a night can hold at all.
 */
const LOCK_TRIES = 5;

function lockout_minutes(int $round): int
{
    $ladder = [5, 10, 60, 120, 180];
    return $round <= count($ladder) ? $ladder[$round - 1] : 180 + 60 * ($round - count($ladder));
}

/** '5m' under the hour, '2h' from it — the wait, sized for an error message. */
function lock_label(int $secs): string
{
    return $secs >= 3600 ? ((int) ceil($secs / 3600)) . 'h' : ((int) max(1, ceil($secs / 60))) . 'm';
}

function lockout_clear(array $cfg, string $user): void
{
    with_lock($cfg, 'lockouts', function () use ($cfg, $user) {
        $db = store_read($cfg, lockouts_file($cfg));
        if (isset($db[$user])) {
            unset($db[$user]);
            store_write($cfg, lockouts_file($cfg), $db);
        }
    });
}
/**
 * One record file per user PER SPACE.
 *
 * The default space is CalMind's and its filename is unchanged, byte for byte,
 * because every existing store is already at that path.
 *
 * ChefMind (Sean, 2026-08-21) is a second app on this same server that reuses
 * these accounts and keeps its own reminders and notes. It sends space='chef'
 * and lands in records-chef-<user>.json. Nothing else about it is different:
 * same auth, same tokens, same merge, same lock discipline — the space is only
 * WHICH FILE.
 *
 * Sharing, the meeting-request pair and the widget feed all call this with no
 * space and therefore always mean CalMind's store. That is deliberate rather
 * than an oversight: a partnership is between two CalMind accounts, and a
 * ChefMind note is not something either of them has agreed to share.
 */
function records_file(array $cfg, string $user, string $space = ''): string
{
    $prefix = $space === '' ? 'records-' : 'records-' . $space . '-';
    return $cfg['data_dir'] . '/' . $prefix . $user . '.json';
}

/**
 * The space a request names, or '' for CalMind's.
 *
 * Whitelisted rather than sanitised. `$in['space']` reaches a FILENAME, so the
 * difference between "reject anything not on the list" and "strip the
 * characters I thought of" is the difference between a closed door and a door
 * with a lock somebody has to have got right — '../' is only the first thing
 * to try. A list of the spaces that exist cannot be walked out of.
 */
const SYNC_SPACES = ['chef'];

/**
 * The spaces this build knows, said out loud and WITHOUT AUTH.
 *
 * ChefMind writes into CalMind's server. If it is ever deployed in front of an
 * API that does not know `space`, the parameter is ignored and every ChefMind
 * record lands in CalMind's own store — two apps merged into one file, found
 * only once somebody's reminders list has recipes in it.
 *
 * So the ChefMind deploy asks first, and refuses to ship if the answer does
 * not name its space. That gate needs an answer from a machine holding no
 * credentials, which is why this is public. What it discloses is the list of
 * apps this server hosts, which is already visible from the outside.
 */
function handle_spaces(): never
{
    reply(200, ['ok' => true, 'spaces' => SYNC_SPACES]);
}

function sync_space(array $in): string
{
    $s = (string) ($in['space'] ?? '');
    if ($s === '') { return ''; }
    if (!in_array($s, SYNC_SPACES, true)) { fail(400, 'unknown space'); }
    return $s;
}

/** A fresh bearer token for $user; only its hash is stored. */
function token_issue(array $cfg, string $user): string
{
    $token = bin2hex(random_bytes(32));
    with_lock($cfg, 'tokens', function () use ($cfg, $token, $user) {
        $t = store_read($cfg, tokens_file($cfg));
        $t[hash('sha256', $token)] = ['user' => $user, 'created' => time()];
        store_write($cfg, tokens_file($cfg), $t);
    });
    return $token;
}

/** Every token a user holds, gone — password change and reset both call this. */
function tokens_revoke(array $cfg, string $user): void
{
    with_lock($cfg, 'tokens', function () use ($cfg, $user) {
        $t = array_filter(store_read($cfg, tokens_file($cfg)), fn($v) => ($v['user'] ?? '') !== $user);
        store_write($cfg, tokens_file($cfg), $t);
    });
}

/** The signed-in user, from the Authorization: Bearer header, or a 401. */
function require_auth(array $cfg): string
{
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+([a-f0-9]{64})$/', $hdr, $m)) {
        fail(401, 'auth required');
    }
    $t = store_read($cfg, tokens_file($cfg));
    $user = $t[hash('sha256', $m[1])]['user'] ?? '';
    if ($user === '') {
        fail(401, 'bad token');
    }
    return $user;
}

// ---------------------------------------------------------------- action handlers

function handle_signup(array $cfg, array $in): never
{
    $user  = (string) ($in['username'] ?? '');
    $email = trim((string) ($in['email'] ?? ''));
    $pass  = (string) ($in['password'] ?? '');
    if (!preg_match(USERNAME_RE, $user))                    { fail(400, 'username: 2-20 letters, numbers, - or _'); }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))         { fail(400, 'that email address doesn\'t look right'); }
    if (strlen($pass) < 6)                                  { fail(400, 'password: at least 6 characters'); }
    $token = with_lock($cfg, 'accounts', function () use ($cfg, $user, $email, $pass) {
        $acc = store_read($cfg, accounts_file($cfg));
        if (isset($acc[$user])) {
            fail(409, 'that username is taken');
        }
        $acc[$user] = ['email' => $email, 'hash' => password_hash($pass, PASSWORD_DEFAULT), 'created' => time()];
        store_write($cfg, accounts_file($cfg), $acc);
        return token_issue($cfg, $user);
    });
    usage_log($cfg, 'signup', $user);
    reply(200, ['ok' => true, 'token' => $token, 'username' => $user]);
}

function handle_login(array $cfg, array $in): never
{
    $user = (string) ($in['username'] ?? '');
    $pass = (string) ($in['password'] ?? '');
    // The lockout gate comes FIRST and holds against the right password too —
    // a lockout that only stops wrong guesses throttles nothing but typos.
    $now   = time();
    $until = with_lock($cfg, 'lockouts', function () use ($cfg, $user, $now) {
        $db = store_read($cfg, lockouts_file($cfg));
        $u  = (int) ($db[$user]['until'] ?? 0);
        return $u > $now ? $u : 0;
    });
    if ($until > 0) {
        usage_log($cfg, 'login_locked', $user);
        fail(429, 'too many attempts — locked for ' . lock_label($until - $now));
    }
    $acc = store_read($cfg, accounts_file($cfg));
    if (!isset($acc[$user]) || !password_verify($pass, $acc[$user]['hash'] ?? '')) {
        // A miss counts against a REAL account only: an unknown name has
        // nothing to lock, and locking it would confirm which names exist.
        if (isset($acc[$user])) {
            with_lock($cfg, 'lockouts', function () use ($cfg, $user, $now) {
                $db = store_read($cfg, lockouts_file($cfg));
                $l  = $db[$user] ?? ['fails' => 0, 'rounds' => 0, 'until' => 0];
                $l['fails'] = (int) $l['fails'] + 1;
                if ($l['fails'] >= LOCK_TRIES) {
                    $l['rounds'] = (int) $l['rounds'] + 1;
                    $l['until']  = $now + 60 * lockout_minutes((int) $l['rounds']);
                    $l['fails']  = 0;
                }
                $db[$user] = $l;
                store_write($cfg, lockouts_file($cfg), $db);
            });
        }
        usage_log($cfg, 'login_fail', $user);
        fail(401, 'wrong username or password');
    }
    // A clean sign-in clears the slate — "consecutive" is the word in the rule.
    lockout_clear($cfg, $user);
    usage_log($cfg, 'login', $user);
    reply(200, ['ok' => true, 'token' => token_issue($cfg, $user), 'username' => $user]);
}

function handle_logout(array $cfg): never
{
    $user = require_auth($cfg);
    $hdr  = $_SERVER['HTTP_AUTHORIZATION'];
    preg_match('/([a-f0-9]{64})$/', $hdr, $m);
    with_lock($cfg, 'tokens', function () use ($cfg, $m) {
        $t = store_read($cfg, tokens_file($cfg));
        unset($t[hash('sha256', $m[1])]);
        store_write($cfg, tokens_file($cfg), $t);
    });
    usage_log($cfg, 'logout', $user);
    reply(200, ['ok' => true]);
}

function handle_change_password(array $cfg, array $in): never
{
    $user = require_auth($cfg);
    $old  = (string) ($in['old'] ?? '');
    $new  = (string) ($in['new'] ?? '');
    if (strlen($new) < 6) { fail(400, 'password: at least 6 characters'); }
    with_lock($cfg, 'accounts', function () use ($cfg, $user, $old, $new) {
        $acc = store_read($cfg, accounts_file($cfg));
        if (!password_verify($old, $acc[$user]['hash'] ?? '')) {
            fail(403, 'current password is wrong');
        }
        $acc[$user]['hash'] = password_hash($new, PASSWORD_DEFAULT);
        store_write($cfg, accounts_file($cfg), $acc);
    });
    tokens_revoke($cfg, $user);   // every other device signs in again
    usage_log($cfg, 'change_password', $user);
    reply(200, ['ok' => true, 'token' => token_issue($cfg, $user)]);
}

function handle_recover(array $cfg, array $in): never
{
    $user = (string) ($in['username'] ?? '');
    $acc  = store_read($cfg, accounts_file($cfg));
    // Always answer ok — which usernames exist is nobody's business.
    if (isset($acc[$user])) {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        with_lock($cfg, 'recover', function () use ($cfg, $user, $code) {
            $r = store_read($cfg, recover_file($cfg));
            $r[$user] = ['code' => $code, 'expires' => time() + RECOVER_TTL, 'tries' => 0];
            store_write($cfg, recover_file($cfg), $r);
        });
        mail_code($cfg, $acc[$user]['email'], $code);
        usage_log($cfg, 'recover', $user);
    }
    reply(200, ['ok' => true]);
}

function handle_reset(array $cfg, array $in): never
{
    $user = (string) ($in['username'] ?? '');
    $code = trim((string) ($in['code'] ?? ''));
    $pass = (string) ($in['password'] ?? '');
    if (strlen($pass) < 6) { fail(400, 'password: at least 6 characters'); }
    with_lock($cfg, 'recover', function () use ($cfg, $user, $code) {
        $r = store_read($cfg, recover_file($cfg));
        $p = $r[$user] ?? null;
        if (!$p || (int) $p['expires'] < time() || (int) $p['tries'] >= RECOVER_TRIES) {
            unset($r[$user]);
            store_write($cfg, recover_file($cfg), $r);
            fail(403, 'that code expired — start again');
        }
        if (!hash_equals((string) $p['code'], $code)) {
            $r[$user]['tries'] = (int) $p['tries'] + 1;
            store_write($cfg, recover_file($cfg), $r);
            fail(403, 'that code doesn\'t match');
        }
        unset($r[$user]);
        store_write($cfg, recover_file($cfg), $r);
    });
    with_lock($cfg, 'accounts', function () use ($cfg, $user, $pass) {
        $acc = store_read($cfg, accounts_file($cfg));
        $acc[$user]['hash'] = password_hash($pass, PASSWORD_DEFAULT);
        store_write($cfg, accounts_file($cfg), $acc);
    });
    tokens_revoke($cfg, $user);
    // A reset proves the mailbox: whoever did it IS the owner, and the owner
    // arriving through recovery should not stay locked out of the front door.
    lockout_clear($cfg, $user);
    usage_log($cfg, 'reset', $user);
    reply(200, ['ok' => true, 'token' => token_issue($cfg, $user), 'username' => $user]);
}

function handle_whoami(array $cfg): never
{
    reply(200, ['ok' => true, 'username' => require_auth($cfg)]);
}

/** The sync round trip: accept newer records, return everything past the cursor. */
function handle_sync(array $cfg, array $in): never
{
    $user    = require_auth($cfg);
    $cursor  = max(0, (int) ($in['cursor'] ?? 0));
    $changes = is_array($in['changes'] ?? null) ? $in['changes'] : [];
    if (count($changes) > MAX_BATCH) {
        fail(400, 'batch too large');
    }
    $space = sync_space($in);
    // The LOCK is per space as well as per user, and has to be: two apps
    // writing one lock name would serialise for no reason, and — worse — a
    // lock named for the wrong file protects nothing at all.
    $out = with_lock($cfg, 'records-' . ($space === '' ? '' : $space . '-') . $user, function () use ($cfg, $user, $space, $cursor, $changes) {
        $db   = store_read($cfg, records_file($cfg, $user, $space));
        $seq  = (int) ($db['seq'] ?? 0);
        $recs = is_array($db['recs'] ?? null) ? $db['recs'] : [];
        $rejected = [];
        foreach ($changes as $c) {
            if (!is_array($c)) { continue; }
            $id      = (string) ($c['id'] ?? '');
            $type    = (string) ($c['type'] ?? '');
            $updated = (int) ($c['updated'] ?? 0);
            if (!preg_match(REC_ID_RE, $id) || !preg_match(REC_TYPE_RE, $type) || $updated <= 0) {
                continue;   // malformed rows are dropped, never fatal — the rest of the batch lands
            }
            if (strlen(json_encode($c['payload'] ?? null)) > MAX_PAYLOAD) {
                // Say so. Dropping it and answering ok made the client forget
                // the record was ever unsent, so it lived on one device and
                // the app called itself synced.
                $rejected[] = $id;
                continue;
            }
            $cur = $recs[$id] ?? null;
            // THE TIE-BREAK, and the reason this is not just `>`.
            //
            // Strictly-newer on both sides meant an equal stamp left every
            // party holding its own copy: two devices that stamped the same
            // record identically stayed different from each other, silently
            // and permanently, and neither would ever push again because
            // neither was dirty. Sean's call, 2026-08-11: the server
            // arbitrates, because it is the one thing both devices agree on.
            //
            // So an equal stamp is accepted when the CONTENT differs — the
            // winner is whichever edit reached here last — and refused when
            // it does not, which is what stops an echo of a record we already
            // hold from bumping the sequence and re-broadcasting itself to
            // every device on every sync.
            $tie = $cur !== null
                && $updated === (int) $cur['updated']
                && !rec_same($cur, $c);
            if ($cur === null || $updated > (int) $cur['updated'] || $tie) {
                $row = ['id' => $id, 'type' => $type, 'updated' => $updated,
                        'deleted' => !empty($c['deleted']), 'payload' => $c['payload'] ?? null,
                        'seq' => ++$seq];
                // A record is REBUILT from this fixed list of keys, so anything
                // else a client sends is dropped here without a word. That is
                // the right default — it is what keeps a malformed row from
                // becoming stored state — but it means a new record-level
                // field has to be named here or it will work on one device and
                // vanish on the round trip.
                //
                // `superseded` marks a tombstone left by a CONVERSION rather
                // than a deletion, so "undo last delete" does not offer to
                // resurrect something the user never deleted. Written only
                // when true, so records that predate it are untouched byte for
                // byte, and left out of rec_same() above because it says why a
                // record went, not what it holds.
                if (!empty($c['superseded'])) { $row['superseded'] = true; }
                $recs[$id] = $row;
            }
        }
        store_write($cfg, records_file($cfg, $user, $space), ['seq' => $seq, 'recs' => $recs]);
        $tail = array_values(array_filter($recs, fn($r) => (int) $r['seq'] > $cursor));
        usort($tail, fn($a, $b) => $a['seq'] <=> $b['seq']);
        return ['cursor' => $seq, 'rejected' => $rejected, 'changes' => array_map(function ($r) {
            unset($r['seq']);
            return $r;
        }, $tail)];
    });
    usage_log($cfg, 'sync', $user);
    reply(200, ['ok' => true, 'cursor' => $out['cursor'], 'rejected' => $out['rejected'], 'changes' => $out['changes']]);
}

// ---------------------------------------------------------------- sharing

/** The user's share record out of their own store — partners + the three
 *  opt-in buckets (record ids). Absent record = shares nothing, names nobody. */
function share_of(array $cfg, string $user): array
{
    $db  = store_read($cfg, records_file($cfg, $user));
    $rec = ($db['recs'] ?? [])['share'] ?? null;
    $p   = (is_array($rec) && empty($rec['deleted']) && is_array($rec['payload'] ?? null)) ? $rec['payload'] : [];
    $names = fn($k) => array_values(array_filter((array) ($p[$k] ?? []), 'is_string'));
    return ['partners' => $names('partners'), 'calendars' => $names('calendars'),
            'folders' => $names('folders'), 'notefolders' => $names('notefolders')];
}

/** The suite's share_mutual(): a partnership exists only while BOTH stored
 *  lists name each other — re-checked from the two stores on every request,
 *  so removal on either side ends all sharing instantly, both ways. */
function share_mutual(array $cfg, string $me, string $partner): bool
{
    if ($me === $partner || $partner === '') { return false; }
    return in_array($partner, share_of($cfg, $me)['partners'], true)
        && in_array($me, share_of($cfg, $partner)['partners'], true);
}

/** Is a record inside what $share opens up? Rows follow their container. */
function share_in_scope(array $share, string $type, string $id, ?array $payload): bool
{
    $cal  = array_flip($share['calendars']);
    $fold = array_flip(array_merge($share['folders'], $share['notefolders']));
    return match ($type) {
        'calendar' => isset($cal[$id]),
        'event'    => isset($cal[(string) (($payload ?? [])['calendarId'] ?? '')]),
        'folder'   => isset($fold[$id]),
        'section', 'reminder', 'note' => isset($fold[(string) (($payload ?? [])['folderId'] ?? '')]),
        default    => false,
    };
}

/** A partner's records filtered to what they share — nothing is ever copied;
 *  this reads the owner's store directly, like the suite reading their file. */
function shared_records(array $cfg, string $owner): array
{
    $share = share_of($cfg, $owner);
    $db    = store_read($cfg, records_file($cfg, $owner));
    $out   = [];
    foreach (($db['recs'] ?? []) as $r) {
        if (!is_array($r) || !empty($r['deleted'])) { continue; }
        $p = is_array($r['payload'] ?? null) ? $r['payload'] : null;
        if (share_in_scope($share, (string) $r['type'], (string) $r['id'], $p)) {
            unset($r['seq']);
            $out[] = $r;
        }
    }
    return $out;
}

/** Everything the first mutual partner shares, plus every named partner's
 *  handshake state for the share window's badges. */
function handle_shared_pull(array $cfg): never
{
    $me       = require_auth($cfg);
    $partners = [];
    $from     = null;
    $records  = [];
    foreach (share_of($cfg, $me)['partners'] as $p) {
        $mutual     = share_mutual($cfg, $me, $p);
        $partners[] = ['name' => $p, 'mutual' => $mutual];
        if ($mutual && $from === null) {
            $from    = $p;
            $records = shared_records($cfg, $p);
        }
    }
    reply(200, ['ok' => true, 'partners' => $partners, 'partner' => $from, 'records' => $records]);
}

/**
 * One write into a partner's store — the shared views' live ticks, row edits
 * and adds. Structure stays theirs: container types are refused outright,
 * and a row must sit inside the shared buckets BOTH as stored and as sent,
 * so a write can neither reach a private row nor drag one into view.
 */
function handle_shared_put(array $cfg, array $in): never
{
    $me      = require_auth($cfg);
    $partner = (string) ($in['partner'] ?? '');
    if (!share_mutual($cfg, $me, $partner)) {
        fail(403, 'not sharing');
    }
    $c = is_array($in['record'] ?? null) ? $in['record'] : null;
    if ($c === null) {
        fail(400, 'record required');
    }
    $id      = (string) ($c['id'] ?? '');
    $type    = (string) ($c['type'] ?? '');
    $updated = (int) ($c['updated'] ?? 0);
    if (!preg_match(REC_ID_RE, $id) || !preg_match(REC_TYPE_RE, $type) || $updated <= 0) {
        fail(400, 'malformed record');
    }
    if (!in_array($type, ['reminder', 'note', 'event'], true)) {
        fail(403, 'structure is theirs');
    }
    if (strlen(json_encode($c['payload'] ?? null)) > MAX_PAYLOAD) {
        fail(400, 'payload too large');
    }
    $share   = share_of($cfg, $partner);
    $payload = is_array($c['payload'] ?? null) ? $c['payload'] : null;
    with_lock($cfg, 'records-' . $partner, function () use ($cfg, $partner, $share, $c, $id, $type, $updated, $payload) {
        $db   = store_read($cfg, records_file($cfg, $partner));
        $recs = is_array($db['recs'] ?? null) ? $db['recs'] : [];
        $cur  = $recs[$id] ?? null;
        $curPayload = is_array($cur['payload'] ?? null) ? $cur['payload'] : null;
        if ($cur !== null && !share_in_scope($share, (string) $cur['type'], $id, $curPayload)) {
            fail(403, 'outside what they share');
        }
        if ($payload !== null && !share_in_scope($share, $type, $id, $payload)) {
            fail(403, 'outside what they share');
        }
        if ($cur === null && $payload === null) {
            fail(400, 'nothing to write');
        }
        // THE SAME TIE-BREAK AS sync, and it was missing here.
        //
        // Sean's call, 2026-08-11: on an equal stamp the server arbitrates,
        // because it is the one thing both devices agree on. That went into
        // the sync handler and not into this one, so the identical tie
        // resolved two different ways depending on whose store was being
        // written. A tick on a partner's row that stamped equal to their own
        // last edit was dropped while this replied ok, and the reconcile then
        // pulled back their untouched copy — a tap that did nothing, said
        // nothing, and looked like the app ignoring you.
        //
        // Compared against what would actually be STORED ($payload, already
        // sanitised) rather than against the raw request, so the answer cannot
        // depend on a shape that is about to be thrown away.
        $tie = $cur !== null
            && $updated === (int) $cur['updated']
            && !rec_same($cur, ['deleted' => !empty($c['deleted']), 'payload' => $payload]);
        if ($cur === null || $updated > (int) $cur['updated'] || $tie) {
            $seq       = (int) ($db['seq'] ?? 0) + 1;
            $recs[$id] = ['id' => $id, 'type' => $type, 'updated' => $updated,
                          'deleted' => !empty($c['deleted']), 'payload' => $payload, 'seq' => $seq];
            store_write($cfg, records_file($cfg, $partner), ['seq' => $seq, 'recs' => $recs]);
        }
    });
    usage_log($cfg, 'shared_put', $me);
    reply(200, ['ok' => true]);
}

// ---------------------------------------------------------------- passkeys

function passkeys_file(array $cfg): string   { return $cfg['data_dir'] . '/passkeys.json'; }
function challenges_file(array $cfg): string { return $cfg['data_dir'] . '/challenges.json'; }

/**
 * A challenge is one-time and short-lived. Storing it server-side is the whole
 * point of the ceremony: without it a replayed signature is as good as a
 * fresh one.
 */
function challenge_issue(array $cfg, string $user = ''): string
{
    $c = b64u_encode(random_bytes(32));
    with_lock($cfg, 'challenges', function () use ($cfg, $c, $user) {
        $all = store_read($cfg, challenges_file($cfg));
        $now = time();
        $all = array_filter($all, fn($v) => ($v['created'] ?? 0) > $now - WEBAUTHN_CHALLENGE_TTL);
        $all[$c] = ['user' => $user, 'created' => $now];
        // Keep the newest by ARRIVAL, not by timestamp. A burst arrives inside
        // the same second, so sorting on `created` orders equal keys
        // arbitrarily and can evict the challenge issued a microsecond ago —
        // which is the one belonging to the person actually signing in. PHP
        // keeps insertion order, and this row was just appended.
        if (count($all) > WEBAUTHN_MAX_CHALLENGES) {
            $all = array_slice($all, -WEBAUTHN_MAX_CHALLENGES, null, true);
        }
        store_write($cfg, challenges_file($cfg), $all);
    });
    return $c;
}

/** Reads a challenge and burns it; null if it never existed or has expired. */
function challenge_take(array $cfg, string $c): ?array
{
    return with_lock($cfg, 'challenges', function () use ($cfg, $c): ?array {
        $all = store_read($cfg, challenges_file($cfg));
        $row = $all[$c] ?? null;
        unset($all[$c]);
        store_write($cfg, challenges_file($cfg), $all);
        if ($row === null || ($row['created'] ?? 0) <= time() - WEBAUTHN_CHALLENGE_TTL) {
            return null;
        }
        return $row;
    });
}

/** The checks both ceremonies share: the browser's own account of what it did. */
function client_data_check(array $cfg, string $json, string $wantType): array
{
    $d = json_decode($json, true);
    if (!is_array($d))                              { fail(400, 'passkey: unreadable client data'); }
    if (($d['type'] ?? '') !== $wantType)           { fail(400, 'passkey: wrong ceremony'); }
    if (!webauthn_origin_ok((string) ($d['origin'] ?? ''), webauthn_origin($cfg))) {
        fail(400, 'passkey: wrong origin');
    }
    return $d;
}

function handle_passkey_register_begin(array $cfg): never
{
    $user = require_auth($cfg);
    $mine = array_filter(store_read($cfg, passkeys_file($cfg)), fn($v) => ($v['user'] ?? '') === $user);
    reply(200, [
        'ok'        => true,
        'challenge' => challenge_issue($cfg, $user),
        'rp'        => ['id' => webauthn_rp_id($cfg), 'name' => 'CalMind'],
        // The user handle is the username: this is a single-account-per-name
        // app, and it is what a passkey login has to resolve back to.
        'user'      => ['id' => b64u_encode($user), 'name' => $user, 'displayName' => $user],
        'pubKeyCredParams' => [
            ['type' => 'public-key', 'alg' => COSE_ES256],
            ['type' => 'public-key', 'alg' => COSE_RS256],
        ],
        'authenticatorSelection' => ['residentKey' => 'required', 'userVerification' => 'required'],
        'attestation'        => 'none',
        'excludeCredentials' => array_values(array_map(
            fn($id) => ['type' => 'public-key', 'id' => $id],
            array_keys($mine),
        )),
    ]);
}

function handle_passkey_register_finish(array $cfg, array $in): never
{
    $user = require_auth($cfg);
    $clientJson = b64u_decode((string) ($in['clientDataJSON'] ?? ''));
    $d = client_data_check($cfg, $clientJson, 'webauthn.create');
    $row = challenge_take($cfg, (string) ($d['challenge'] ?? ''));
    if ($row === null || ($row['user'] ?? '') !== $user) { fail(400, 'passkey: stale challenge'); }

    try {
        $att = cbor_decode(b64u_decode((string) ($in['attestationObject'] ?? '')));
        if (!is_array($att) || !isset($att['authData'])) { fail(400, 'passkey: no authenticator data'); }
        $auth = authdata_parse((string) $att['authData']);
        $pem  = $auth['cose'] === null ? '' : cose_to_pem($auth['cose']);
    } catch (RuntimeException $e) {
        fail(400, 'passkey: ' . $e->getMessage());
    }
    if (!hash_equals(hash('sha256', webauthn_rp_id($cfg), true), $auth['rpIdHash'])) {
        fail(400, 'passkey: wrong relying party');
    }
    // User presence AND user verification: we asked for a fingerprint or a
    // face, and a passkey that skipped it is not the login we offered.
    if (($auth['flags'] & 0x01) === 0 || ($auth['flags'] & 0x04) === 0) {
        fail(400, 'passkey: not verified on the device');
    }
    if ($pem === '') { fail(400, 'passkey: no public key'); }

    $id = b64u_encode($auth['credId']);
    with_lock($cfg, 'passkeys', function () use ($cfg, $id, $user, $pem, $auth, $in) {
        $all = store_read($cfg, passkeys_file($cfg));
        if (isset($all[$id])) { fail(409, 'passkey: already registered'); }
        $all[$id] = [
            'user'      => $user,
            'pem'       => $pem,
            'signCount' => $auth['signCount'],
            'label'     => substr(trim((string) ($in['label'] ?? 'passkey')), 0, 40),
            'created'   => time(),
        ];
        store_write($cfg, passkeys_file($cfg), $all);
    });
    usage_log($cfg, 'passkey_add', $user);
    reply(200, ['ok' => true, 'id' => $id]);
}

function handle_passkey_login_begin(array $cfg): never
{
    // No username: the passkey is discoverable, so the authenticator tells us
    // who it is. Asking who they are first would leak which names exist.
    reply(200, [
        'ok'               => true,
        'challenge'        => challenge_issue($cfg),
        'rpId'             => webauthn_rp_id($cfg),
        'userVerification' => 'required',
    ]);
}

function handle_passkey_login_finish(array $cfg, array $in): never
{
    $clientJson = b64u_decode((string) ($in['clientDataJSON'] ?? ''));
    $d = client_data_check($cfg, $clientJson, 'webauthn.get');
    if (challenge_take($cfg, (string) ($d['challenge'] ?? '')) === null) {
        fail(400, 'passkey: stale challenge');
    }

    $id  = (string) ($in['id'] ?? '');
    $all = store_read($cfg, passkeys_file($cfg));
    $key = $all[$id] ?? null;
    if ($key === null) {
        usage_log($cfg, 'passkey_fail', '');
        fail(401, 'passkey: not recognised');
    }

    $authRaw = b64u_decode((string) ($in['authenticatorData'] ?? ''));
    try {
        $auth = authdata_parse($authRaw);
    } catch (RuntimeException $e) {
        fail(400, 'passkey: ' . $e->getMessage());
    }
    if (!hash_equals(hash('sha256', webauthn_rp_id($cfg), true), $auth['rpIdHash'])) {
        fail(400, 'passkey: wrong relying party');
    }
    if (($auth['flags'] & 0x01) === 0 || ($auth['flags'] & 0x04) === 0) {
        fail(401, 'passkey: not verified on the device');
    }

    $signed = $authRaw . hash('sha256', $clientJson, true);
    $ok = openssl_verify($signed, b64u_decode((string) ($in['signature'] ?? '')), $key['pem'], OPENSSL_ALGO_SHA256);
    if ($ok !== 1) {
        usage_log($cfg, 'passkey_fail', (string) $key['user']);
        fail(401, 'passkey: signature did not verify');
    }

    // A counter that goes backwards means two authenticators are answering for
    // one credential. Plenty of passkeys report 0 forever, and 0 vs 0 is not
    // evidence of anything.
    $stored = (int) ($key['signCount'] ?? 0);
    if ($auth['signCount'] > 0 && $stored > 0 && $auth['signCount'] <= $stored) {
        usage_log($cfg, 'passkey_clone', (string) $key['user']);
        fail(401, 'passkey: refused, counter went backwards');
    }
    with_lock($cfg, 'passkeys', function () use ($cfg, $id, $auth) {
        $all = store_read($cfg, passkeys_file($cfg));
        if (isset($all[$id])) {
            $all[$id]['signCount'] = $auth['signCount'];
            $all[$id]['used']      = time();
            store_write($cfg, passkeys_file($cfg), $all);
        }
    });

    $user = (string) $key['user'];
    usage_log($cfg, 'passkey_login', $user);
    reply(200, ['ok' => true, 'token' => token_issue($cfg, $user), 'username' => $user]);
}

function handle_passkey_list(array $cfg): never
{
    $user = require_auth($cfg);
    $out  = [];
    foreach (store_read($cfg, passkeys_file($cfg)) as $id => $v) {
        if (($v['user'] ?? '') === $user) {
            $out[] = ['id' => $id, 'label' => $v['label'] ?? 'passkey', 'created' => $v['created'] ?? 0, 'used' => $v['used'] ?? 0];
        }
    }
    reply(200, ['ok' => true, 'passkeys' => $out]);
}

function handle_passkey_remove(array $cfg, array $in): never
{
    $user = require_auth($cfg);
    $id   = (string) ($in['id'] ?? '');
    with_lock($cfg, 'passkeys', function () use ($cfg, $id, $user) {
        $all = store_read($cfg, passkeys_file($cfg));
        if (($all[$id]['user'] ?? '') !== $user) { fail(404, 'passkey: not yours'); }
        unset($all[$id]);
        store_write($cfg, passkeys_file($cfg), $all);
    });
    usage_log($cfg, 'passkey_remove', $user);
    reply(200, ['ok' => true]);
}

/**
 * Fetch a recipe page so the client can read its structured data.
 *
 * The browser cannot do this itself — a recipe site does not send CORS
 * headers to a web app, and a native build fetching arbitrary pages has the
 * same SSRF problem from the phone's network. So the server fetches, through
 * fetchurl.php, which was built carefully for exactly this and wired to
 * nothing until now: public addresses only, checked on every redirect hop,
 * bounded in time and size.
 *
 * Returns the HTML and nothing else. The PARSING lives in core
 * (recipeFromHtml), where it is tested — the server has no opinion about
 * what a recipe is, and a change to the parser must not need a deploy.
 *
 * Authed: it makes the server issue requests, so it is not an open proxy.
 */
/**
 * A subscribed calendar's ICS, fetched by the server. Sean's call,
 * 2026-08-18: "subscribe-by-link first, i just want read only access to
 * other calendar system" — and the fetch HAS to be server-side, because
 * calendar hosts do not answer CORS and a browser cannot read them.
 *
 * The server stays dumb, the suite's way: it hands back the ICS TEXT and
 * core's parseIcal (234 lines, tested, zone-aware) decides what it means on
 * the client — a parser change must not need a deploy. fetch_url does the
 * SSRF work; it was built for exactly this file type and waited months for
 * this caller.
 *
 * Cached briefly, keyed by the URL's hash, through store_read/store_write —
 * which buys ENC1 at rest (a private feed URL's CONTENT is someone's
 * calendar) and the atomic temp-file write, for free. Fifteen minutes keeps
 * a four-device account from hammering a host on every foreground; a fetch
 * that FAILS falls back to the stale copy when one exists, because last
 * week's calendar beats an error on a train.
 *
 * Authed, like recipe_fetch and for the same reason: this makes the server
 * issue requests, so it is not an open proxy.
 */
const CALSUB_CACHE_TTL = 900;

function handle_calsub_fetch(array $cfg, array $in): never
{
    require_auth($cfg);
    $url = trim((string) ($in['url'] ?? ''));
    if ($url === '') {
        fail(400, 'no url');
    }
    // webcal:// is how calendar apps hand these links out; it MEANS https.
    if (stripos($url, 'webcal://') === 0) {
        $url = 'https://' . substr($url, 9);
    }
    $file = $cfg['data_dir'] . '/icscache/' . sha1($url) . '.json';
    // A cache that will not decrypt is a cache miss, not an outage — unlike
    // the record store, everything here can be fetched again.
    try {
        $cached = store_read($cfg, $file);
    } catch (Throwable) {
        $cached = [];
    }
    $ics = (string) ($cached['ics'] ?? '');
    if ($ics !== '' && (int) ($cached['at'] ?? 0) > time() - CALSUB_CACHE_TTL) {
        reply(200, ['ok' => true, 'ics' => $ics, 'cached' => true]);
    }
    $res = fetch_url($url);
    if (!$res['ok']) {
        if ($ics !== '') {
            reply(200, ['ok' => true, 'ics' => $ics, 'cached' => true, 'stale' => true]);
        }
        // The reason travels, recipe_fetch's lesson: 'not a public address'
        // and 'took too long' are different problems for whoever pasted it.
        $why = trim((string) ($res['error'] ?? ''));
        if ($why === '') {
            $code = (int) ($res['status'] ?? 0);
            $why = $code > 0 ? "that calendar's host answered $code" : 'could not reach that calendar';
        }
        fail(400, $why);
    }
    $body = (string) $res['body'];
    if (stripos($body, 'BEGIN:VCALENDAR') === false) {
        fail(400, 'that link is not a calendar (.ics) feed');
    }
    store_write($cfg, $file, ['at' => time(), 'ics' => $body]);
    reply(200, ['ok' => true, 'ics' => $body, 'cached' => false]);
}

function handle_recipe_fetch(array $cfg, array $in): never
{
    require_auth($cfg);
    $url = trim((string) ($in['url'] ?? ''));
    if ($url === '') {
        fail(400, 'no url');
    }
    $res = fetch_url($url);
    if (!$res['ok']) {
        // The reason travels: 'that is not a public address' and 'the page
        // took too long' are different problems for whoever pasted the link.
        //
        // `?:` not `??`. With `??` an EMPTY error string passed straight
        // through, and the app showed a blank message — which is how a real
        // failure (allrecipes.com refuses this server outright) looked like
        // nothing happening at all. A message that says nothing is worse than
        // a generic one that says something.
        $why = trim((string) ($res['error'] ?? ''));
        if ($why === '') {
            $code = (int) ($res['status'] ?? 0);
            $why = $code > 0
                ? "that site answered $code — some block servers like this one"
                : 'could not reach that page';
        }
        fail(400, $why);
    }
    // A recipe page is HTML. Anything else — a PDF, an image, a 4MB video —
    // has no JSON-LD to find and is not worth carrying back to the client.
    $body = (string) $res['body'];
    if (stripos($body, '<html') === false && stripos($body, '<script') === false) {
        fail(400, 'that page does not look like a web page');
    }
    reply(200, ['ok' => true, 'html' => $body]);
}

// ---------------------------------------------------------------- meeting requests
//
// The public request page (Sean, 2026-08-19): anyone with the link may ask
// for ~1 hour inside the day's open window, on any day his calendar leaves
// open. The window is HIS WEEK, not one number — see meetreq_window(). The
// slot arithmetic lives HERE rather than in core — a deliberate exception to
// "behavior lives in core": an anonymous create must be validated by the
// server against the same rule the page drew, and a rule the server cannot
// run is a rule it cannot enforce. core/src/meetreq.ts owns the client half
// (what accepting builds) and says the same thing from its side.
//
// A granted request is appended to the OWNER'S OWN STORE as a `meetreq`
// record, so it reaches every device through ordinary sync — no new channel,
// no polling endpoint, and accept/decline/new-time are ordinary record edits
// made by his client.

const MEETREQ_IP_MAX = 5;      // creates per IP per hour — it is a public write
const MEETREQ_PENDING_MAX = 200; // a flood must not balloon the store

/** The day's requestable window as [startHour, endHourExclusive) — Sean's
 *  hours (2026-08-19, settled on the third pass): every day 10am–8pm, except
 *  Tuesday opens at 2pm and Friday/Saturday run to 11pm. The end is
 *  exclusive, so the last ~1h slot starts one hour before close. */
function meetreq_window(string $date): array
{
    $dow = (int) date('N', strtotime($date)); // 1 = Monday … 7 = Sunday
    if ($dow === 2) { return [14, 20]; }
    if ($dow === 5 || $dow === 6) { return [10, 23]; }
    return [10, 20];
}

/** '10am', '2pm', '11pm' — how a window edge reads in a refusal. */
function meetreq_hour_label(int $h): string
{
    $h12 = $h % 12 === 0 ? 12 : $h % 12;
    return $h12 . ($h < 12 ? 'am' : 'pm');
}

function meetreq_user(array $cfg): string
{
    // Whose calendar the public page offers. One account per instance is the
    // reality (there is no prod instance and the test one is Sean's); the
    // config key exists so that fact lives in one place.
    return (string) ($cfg['meetreq_user'] ?? 'sean');
}

/** The day's busy windows as [startMin, endMin), from the owner's events.
 *  Timeless events do not block — a day-marker ("Recycling") is not a
 *  meeting — and neither do pending requests: only an ACCEPTED one has
 *  become an event, and letting raw requests block slots would let anyone
 *  squat the calendar by asking. */
function meetreq_busy(array $cfg, string $user, string $date): array
{
    $db   = store_read($cfg, records_file($cfg, $user));
    $recs = is_array($db['recs'] ?? null) ? $db['recs'] : [];
    $busy = [];
    foreach ($recs as $r) {
        if (($r['type'] ?? '') !== 'event' || !empty($r['deleted'])) { continue; }
        $p = $r['payload'] ?? [];
        if (($p['date'] ?? '') !== $date) { continue; }
        $t = (string) ($p['time'] ?? '');
        if (!preg_match('/^(\d{2}):(\d{2})$/', $t, $m)) { continue; }
        $s = (int) $m[1] * 60 + (int) $m[2];
        $e = $s + 60;
        $endRaw = (string) ($p['end'] ?? '');
        if (preg_match('/^(\d{2}):(\d{2})$/', $endRaw, $me)) {
            $em = (int) $me[1] * 60 + (int) $me[2];
            // An end past midnight reads as the small hours (the event model's
            // own rule); for blocking purposes that is "until the day ends".
            $e = $em > $s ? $em : 24 * 60;
        }
        $busy[] = [$s, $e];
    }
    return $busy;
}

/** Which 'HH:00' starts are open on one day. Past days and passed hours are
 *  closed; a slot is open when no busy window overlaps its hour. */
function meetreq_slots_for(array $cfg, string $user, string $date): array
{
    $today = date('Y-m-d');
    if ($date < $today) { return []; }
    $nowMin = $date === $today ? ((int) date('G')) * 60 + (int) date('i') : -1;
    $busy = meetreq_busy($cfg, $user, $date);
    [$open, $close] = meetreq_window($date);
    $out = [];
    for ($h = $open; $h < $close; $h++) {
        $s = $h * 60;
        if ($s <= $nowMin) { continue; }
        $blocked = false;
        foreach ($busy as [$bs, $be]) {
            if ($bs < $s + 60 && $be > $s) { $blocked = true; break; }
        }
        if (!$blocked) { $out[] = sprintf('%02d:00', $h); }
    }
    return $out;
}

/** PUBLIC: the open slots for a run of days — what the request page draws.
 *  Only open/closed leaves here: no titles, no ids, no exact busy times. */
function handle_meetreq_slots(array $cfg, array $in): never
{
    $user = (string) ($in['user'] ?? '') !== '' ? (string) $in['user'] : meetreq_user($cfg);
    if (!preg_match(USERNAME_RE, $user)) { fail(400, 'bad user'); }
    $from = (string) ($in['from'] ?? date('Y-m-d'));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) { fail(400, 'bad from'); }
    $days = min(45, max(1, (int) ($in['days'] ?? 31)));
    $out = [];
    for ($i = 0; $i < $days; $i++) {
        $d = date('Y-m-d', strtotime("$from +$i day"));
        $out[$d] = meetreq_slots_for($cfg, $user, $d);
    }
    usage_log($cfg, 'meetreq_slots', $user);
    reply(200, ['ok' => true, 'days' => $out]);
}

/** PUBLIC: create a request. Validated against the same slot rule the page
 *  drew — never trust the client's idea of "open". */
function handle_meetreq_create(array $cfg, array $in): never
{
    $user  = (string) ($in['user'] ?? '') !== '' ? (string) $in['user'] : meetreq_user($cfg);
    if (!preg_match(USERNAME_RE, $user)) { fail(400, 'bad user'); }
    $name  = trim(preg_replace('/[\x00-\x1f\x7f]/', '', (string) ($in['name'] ?? '')));
    $email = trim((string) ($in['email'] ?? ''));
    $date  = (string) ($in['date'] ?? '');
    $time  = (string) ($in['time'] ?? '');
    if ($name === '' || mb_strlen($name) > 80) { fail(400, 'a name is required (up to 80 characters)'); }
    if (strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) { fail(400, 'a real email is required'); }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { fail(400, 'bad date'); }
    if (!preg_match('/^(\d{2}):00$/', $time, $m)) { fail(400, 'meetings start on the hour'); }
    [$open, $close] = meetreq_window($date);
    if ((int) $m[1] < $open || (int) $m[1] >= $close) {
        fail(400, sprintf('meetings run %s to %s that day, on the hour',
            meetreq_hour_label($open), meetreq_hour_label($close)));
    }

    // A public write gets a per-IP throttle — the same posture as login's
    // lockouts, sized for a human politely rescheduling, not a script.
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '-');
    $now = time();
    $granted = with_lock($cfg, 'meetreq-ips', function () use ($cfg, $ip, $now) {
        $f = $cfg['data_dir'] . '/meetreq-ips.json';
        $all = store_read($cfg, $f);
        $mine = array_values(array_filter($all[$ip] ?? [], fn($t) => $t > $now - 3600));
        if (count($mine) >= MEETREQ_IP_MAX) { return false; }
        $mine[] = $now;
        $all[$ip] = $mine;
        // Prune dead IPs so the file cannot grow without bound.
        foreach ($all as $k => $ts) {
            $ts = array_values(array_filter($ts, fn($t) => $t > $now - 3600));
            if ($ts === []) { unset($all[$k]); } else { $all[$k] = $ts; }
        }
        store_write($cfg, $f, $all);
        return true;
    });
    if (!$granted) { fail(429, 'too many requests from here — try again in an hour'); }

    // An account that does not exist gets a quiet ok and no write: which
    // usernames exist is nobody's business (recover's rule), and the real
    // page always carries a real user.
    $accounts = store_read($cfg, accounts_file($cfg));
    if (!isset($accounts[$user])) {
        usage_log($cfg, 'meetreq_create_orphan', $user);
        reply(200, ['ok' => true]);
    }

    if (!in_array($time, meetreq_slots_for($cfg, $user, $date), true)) {
        fail(409, 'that time is no longer open — pick another');
    }

    with_lock($cfg, 'records-' . $user, function () use ($cfg, $user, $name, $email, $date, $time) {
        $db   = store_read($cfg, records_file($cfg, $user));
        $seq  = (int) ($db['seq'] ?? 0);
        $recs = is_array($db['recs'] ?? null) ? $db['recs'] : [];
        $pending = 0;
        foreach ($recs as $r) {
            if (($r['type'] ?? '') === 'meetreq' && empty($r['deleted'])) { $pending++; }
        }
        if ($pending >= MEETREQ_PENDING_MAX) { fail(429, 'the calendar is not taking requests right now'); }
        $id = 'mr' . bin2hex(random_bytes(5));
        $recs[$id] = [
            'id' => $id, 'type' => 'meetreq',
            'updated' => (int) (microtime(true) * 1000), 'deleted' => false,
            'payload' => ['name' => $name, 'email' => $email, 'date' => $date, 'time' => $time, 'status' => 'new'],
            'seq' => ++$seq,
        ];
        store_write($cfg, records_file($cfg, $user), ['seq' => $seq, 'recs' => $recs]);
    });
    // STUB — a notification to the owner would fire here when notifications
    // exist ("no notifications or badges for now", Sean, 2026-08-19). The
    // record reaching his devices through sync is the whole signal today.
    usage_log($cfg, 'meetreq_create', $user);
    reply(200, ['ok' => true]);
}

/**
 * The email answer, STUBBED the way mail_code is: the line always lands in
 * meetreq-mail.log, and a real send happens only once the host is configured
 * to send ("i can't fire off emails right now but we'll fix that later" —
 * Sean, 2026-08-19; flipping cfg['send_mail'] is the later). Authenticated:
 * it is the OWNER'S client answering a request, never the public page.
 */
function handle_meetreq_mail(array $cfg, array $in): never
{
    $user = require_auth($cfg);
    $to   = trim((string) ($in['to'] ?? ''));
    $kind = (string) ($in['kind'] ?? '');
    $when = trim((string) ($in['when'] ?? ''));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) { fail(400, 'bad to'); }
    if (!in_array($kind, ['accepted', 'declined', 'newtime'], true)) { fail(400, 'bad kind'); }
    $lines = [
        'accepted' => "Your meeting request was accepted: $when (about an hour).",
        'declined' => 'Your meeting request was declined.',
        'newtime'  => "A different time was proposed for your meeting: $when (about an hour).",
    ];
    $how = 'log-only';
    if (!empty($cfg['send_mail'])) {
        $ok  = @mail($to, 'Your meeting request', $lines[$kind] . "\n");
        $how = $ok ? 'mailed' : 'MAIL REFUSED';
    }
    $line = date('c') . "  by=$user  to=$to  kind=$kind  when=$when  $how\n";
    @file_put_contents($cfg['data_dir'] . '/meetreq-mail.log', $line, FILE_APPEND | LOCK_EX);
    usage_log($cfg, 'meetreq_mail', $user);
    reply(200, ['ok' => true, 'sent' => $how]);
}
