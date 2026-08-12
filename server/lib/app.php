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
 * The clock. The server keeps UTC unless told otherwise, and the feed asks it
 * what day it is — so without this, "today" turned over at 7pm Chicago and the
 * widget spent every evening calling tomorrow today, rolling reminders a day
 * early with it. The suite learned this the same way and pins the same
 * default; the config key is the one place to move it.
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
function records_file(array $cfg, string $user): string { return $cfg['data_dir'] . '/records-' . $user . '.json'; }

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
    $acc  = store_read($cfg, accounts_file($cfg));
    if (!isset($acc[$user]) || !password_verify($pass, $acc[$user]['hash'] ?? '')) {
        usage_log($cfg, 'login_fail', $user);
        fail(401, 'wrong username or password');
    }
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
    $out = with_lock($cfg, 'records-' . $user, function () use ($cfg, $user, $cursor, $changes) {
        $db   = store_read($cfg, records_file($cfg, $user));
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
        store_write($cfg, records_file($cfg, $user), ['seq' => $seq, 'recs' => $recs]);
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
        if ($cur === null || $updated > (int) $cur['updated']) {
            $seq       = (int) ($db['seq'] ?? 0) + 1;
            $recs[$id] = ['id' => $id, 'type' => $type, 'updated' => $updated,
                          'deleted' => !empty($c['deleted']), 'payload' => $payload, 'seq' => $seq];
            store_write($cfg, records_file($cfg, $partner), ['seq' => $seq, 'recs' => $recs]);
        }
    });
    usage_log($cfg, 'shared_put', $me);
    reply(200, ['ok' => true]);
}

// ---------------------------------------------------------------- the widget feed

function widget_tokens_file(array $cfg): string { return $cfg['data_dir'] . '/widgettokens.json'; }

/** The user's READ-ONLY widget token, minted once — the suite's rule holds:
 *  the feed token is a read credential, and nothing behind it may write. */
/**
 * The widget's read-only key. ONE per user, handed out once — which is what
 * the old comment here claimed and the old code did not do: it rotated on
 * every call, so merely OPENING the widget page retired the key the widget on
 * the home screen was using. Nothing said so until the widget quietly stopped
 * updating, which reads as the widget being broken rather than as something
 * you did.
 *
 * Rotation is now something you ask for. Without `rotate`, an account that
 * already has a key is told so and nothing changes; the key itself cannot be
 * shown again because only its hash is kept.
 */
function handle_widget_token(array $cfg, array $in): never
{
    $user   = require_auth($cfg);
    $rotate = !empty($in['rotate']);
    $out = with_lock($cfg, 'widgettokens', function () use ($cfg, $user, $rotate) {
        $all  = store_read($cfg, widget_tokens_file($cfg));
        $held = false;
        foreach ($all as $u) {
            if ($u === $user) { $held = true; break; }
        }
        if ($held && !$rotate) {
            return ['token' => null, 'exists' => true];
        }
        $all   = array_filter($all, fn($u) => $u !== $user);
        $token = bin2hex(random_bytes(24));
        $all[hash('sha256', $token)] = $user;
        store_write($cfg, widget_tokens_file($cfg), $all);
        return ['token' => $token, 'exists' => false];
    });
    usage_log($cfg, $rotate ? 'widget_token_rotate' : 'widget_token', $user);
    reply(200, ['ok' => true, 'token' => $out['token'], 'exists' => $out['exists']]);
}

/** GET feed: the widget's 21 days — reminders (undated riders + dated + the
 *  overdue on today) and events, repeats expanded, grouped by day. Notes never
 *  reach the widget. Token-read only, exactly the suite's feed.php contract. */
function handle_feed(array $cfg): never
{
    $tok = (string) ($_GET['t'] ?? '');
    $all = store_read($cfg, widget_tokens_file($cfg));
    $user = $all[hash('sha256', $tok)] ?? '';
    if ($user === '') { fail(401, 'bad token'); }
    $db = store_read($cfg, records_file($cfg, $user));
    $recs = array_filter($db['recs'] ?? [], fn($r) => empty($r['deleted']));
    $today = date('Y-m-d');
    $days = [];
    for ($i = 0; $i < 21; $i++) { $days[date('Y-m-d', strtotime("+$i days"))] = []; }

    // The suite's feed_scope: the widget follows what the calendar shows —
    // hidden folders drop their reminders, hidden calendars their events.
    $prefs = fn(string $app) => is_array(($recs["prefs_$app"]['payload'] ?? null)) ? $recs["prefs_$app"]['payload'] : [];
    $hidFolders = array_flip((array) ($prefs('reminders')['hidden'] ?? []));
    $calPrefs = $prefs('calendar');
    $hidCals = array_flip((array) ($calPrefs['hidden'] ?? []));
    $onlyCal = (string) ($calPrefs['lastView'] ?? 'all');
    // The suite's cals= pin: the setup page bakes the calendars showing at
    // copy time into the URL. Validated against the owner's ids so it can
    // only narrow; absent, 'all' or fully-stale pins follow prefs as before.
    // Reminder folders are never pinned — they always follow hidden.
    $pin = null;
    if (isset($_GET['cals']) && $_GET['cals'] !== 'all') {
        $own = [];
        foreach ($recs as $r0) { if (($r0['type'] ?? '') === 'calendar') { $own[$r0['id']] = true; } }
        $ids = array_values(array_filter(explode(',', (string) $_GET['cals']), fn($i) => isset($own[$i])));
        if ($ids !== []) { $pin = array_flip($ids); }
    }

    $rideAlong = [];
    foreach ($recs as $r) {
        if ($r['type'] === 'folder' && !empty($r['payload']['rideAlong'])) { $rideAlong[$r['id']] = true; }
    }
    $step = function (string $start, array $rep, int $i): string {
        [$y, $m, $d] = array_map('intval', explode('-', $start));
        $n = $rep['n'] * $i;
        return match ($rep['unit']) {
            'day' => date('Y-m-d', mktime(0, 0, 0, $m, $d + $n, $y)),
            'week' => date('Y-m-d', mktime(0, 0, 0, $m, $d + $n * 7, $y)),
            default => (function () use ($y, $m, $d, $n, $rep) {
                $mm = $rep['unit'] === 'month' ? $m + $n : $m;
                $yy = $rep['unit'] === 'year' ? $y + $n : $y;
                $first = mktime(0, 0, 0, $mm, 1, $yy);
                return date('Y-m-d', mktime(0, 0, 0, (int) date('n', $first), min($d, (int) date('t', $first)), (int) date('Y', $first)));
            })(),
        };
    };
    $expand = function (?string $start, $rep) use ($days, $step, $today): array {
        if (!$start) { return []; }
        if (!is_array($rep)) { return isset($days[$start]) ? [$start] : []; }
        $out = [];
        $to = date('Y-m-d', strtotime('+20 days'));
        for ($i = 0; $i < 400; $i++) {
            $d = $step($start, $rep, $i);
            if ($d > $to) { break; }
            if (isset($days[$d])) { $out[] = $d; }
        }
        return $out;
    };

    foreach ($recs as $r) {
        $p = $r['payload'];
        if ($r['type'] === 'reminder' && empty($p['done'])) {
            if (isset($hidFolders[$p['folderId'] ?? ''])) { continue; }
            $rolled = !empty($p['due']) && $p['due'] < $today;
            if (empty($p['due']) && isset($rideAlong[$p['folderId'] ?? ''])) {
                $days[$today][] = ['kind' => 'reminder', 'id' => $r['id'], 'text' => $p['text'], 'time' => $p['time'] ?? null, 'rolled' => false];
            } elseif ($rolled) {
                $days[$today][] = ['kind' => 'reminder', 'id' => $r['id'], 'text' => $p['text'], 'time' => $p['time'] ?? null, 'rolled' => true];
                // A rolled REPEATING reminder still owes its future dates —
                // the suite lists repeats past the rolled one inside the window.
                foreach ($expand($p['due'], $p['repeat'] ?? null) as $d) {
                    if ($d > $today) {
                        $days[$d][] = ['kind' => 'reminder', 'id' => $r['id'], 'text' => $p['text'], 'time' => $p['time'] ?? null, 'rolled' => false];
                    }
                }
            } else {
                foreach ($expand($p['due'] ?? null, $p['repeat'] ?? null) as $d) {
                    $days[$d][] = ['kind' => 'reminder', 'id' => $r['id'], 'text' => $p['text'], 'time' => $p['time'] ?? null, 'rolled' => false];
                }
            }
        }
        if ($r['type'] === 'event') {
            $cal = (string) ($p['calendarId'] ?? '');
            if ($pin !== null ? !isset($pin[$cal]) : (isset($hidCals[$cal]) || ($onlyCal !== 'all' && $cal !== $onlyCal))) { continue; }
            foreach ($expand($p['date'] ?? null, $p['repeat'] ?? null) as $d) {
                $days[$d][] = ['kind' => 'event', 'id' => $r['id'], 'text' => $p['text'], 'time' => $p['time'] ?? null];
            }
        }
    }
    // Reminders before events within each day, the suite's widget order.
    foreach ($days as $d => &$rows) {
        usort($rows, fn($a, $b) => ($a['kind'] === $b['kind']) ? strcmp((string) ($a['time'] ?? ''), (string) ($b['time'] ?? '')) : ($a['kind'] === 'reminder' ? -1 : 1));
    }
    // Stored times are HH:MM; the widget speaks the suite's style (3pm, 2:30pm).
    $spoken = function (?string $t): ?string {
        if (!$t) { return $t; }
        [$h, $m] = array_map('intval', explode(':', $t));
        $ap = $h >= 12 ? 'pm' : 'am';
        $h12 = $h % 12 === 0 ? 12 : $h % 12;
        return $m ? sprintf('%d:%02d%s', $h12, $m, $ap) : $h12 . $ap;
    };
    foreach ($days as &$rows0) {
        foreach ($rows0 as &$r0) { $r0['time'] = $spoken($r0['time']); }
    }
    unset($rows0, $r0);

    // The suite's widget carries at most 12 rows across the window.
    $kept = 0;
    foreach ($days as $d => &$rows) {
        $take = max(0, min(count($rows), 12 - $kept));
        $rows = array_slice($rows, 0, $take);
        $kept += $take;
    }
    unset($rows);
    reply(200, ['ok' => true, 'today' => $today, 'days' => array_filter($days)]);
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
