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

const USERNAME_RE   = '/^[A-Za-z0-9_-]{2,20}$/';
const REC_ID_RE     = '/^[A-Za-z0-9_-]{1,64}$/';
const REC_TYPE_RE   = '/^[a-z]{1,20}$/';   // folder|section|reminder today; events, notes, habits later without a server change
const MAX_BATCH     = 500;
const MAX_PAYLOAD   = 65536;               // bytes of JSON per record
const RECOVER_TTL   = 900;                 // a code lives fifteen minutes
const RECOVER_TRIES = 5;

function app_config(): array
{
    $cfg = is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
    $cfg['data_dir'] ??= getenv('CALMIND_DATA_DIR') ?: dirname(__DIR__) . '/data';
    return $cfg;
}

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
function usage_log(array $cfg, string $action, string $user): void
{
    $tok  = fn(string $s) => preg_replace('/[^\w.@-]/', '_', $s);
    $line = date('Y-m-d H:i:s') . "\t" . $tok($_SERVER['REMOTE_ADDR'] ?? '-') . "\t" . $tok($user) . "\t" . $tok($action) . "\n";
    @file_put_contents($cfg['data_dir'] . '/usage.log', $line, FILE_APPEND | LOCK_EX);
}

/** Recovery codes go to the account email; without mail config they land in mail.log,
 *  which is also how the test harness reads them. */
function mail_code(array $cfg, string $email, string $code): void
{
    $line = date('c') . "  to=$email  code=$code\n";
    @file_put_contents($cfg['data_dir'] . '/mail.log', $line, FILE_APPEND | LOCK_EX);
    if (!empty($cfg['send_mail'])) {
        @mail($email, 'CalMind password reset', "Your CalMind reset code is: $code\n\nIt expires in 15 minutes.");
    }
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
        foreach ($changes as $c) {
            if (!is_array($c)) { continue; }
            $id      = (string) ($c['id'] ?? '');
            $type    = (string) ($c['type'] ?? '');
            $updated = (int) ($c['updated'] ?? 0);
            if (!preg_match(REC_ID_RE, $id) || !preg_match(REC_TYPE_RE, $type) || $updated <= 0) {
                continue;   // malformed rows are dropped, never fatal — the rest of the batch lands
            }
            if (strlen(json_encode($c['payload'] ?? null)) > MAX_PAYLOAD) {
                continue;
            }
            $cur = $recs[$id] ?? null;
            if ($cur === null || $updated > (int) $cur['updated']) {
                $recs[$id] = ['id' => $id, 'type' => $type, 'updated' => $updated,
                              'deleted' => !empty($c['deleted']), 'payload' => $c['payload'] ?? null,
                              'seq' => ++$seq];
            }
        }
        store_write($cfg, records_file($cfg, $user), ['seq' => $seq, 'recs' => $recs]);
        $tail = array_values(array_filter($recs, fn($r) => (int) $r['seq'] > $cursor));
        usort($tail, fn($a, $b) => $a['seq'] <=> $b['seq']);
        return ['cursor' => $seq, 'changes' => array_map(function ($r) {
            unset($r['seq']);
            return $r;
        }, $tail)];
    });
    usage_log($cfg, 'sync', $user);
    reply(200, ['ok' => true, 'cursor' => $out['cursor'], 'changes' => $out['changes']]);
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
function handle_widget_token(array $cfg): never
{
    $user = require_auth($cfg);
    $t = with_lock($cfg, 'widgettokens', function () use ($cfg, $user) {
        $all = store_read($cfg, widget_tokens_file($cfg));
        foreach ($all as $hash => $u) {
            if ($u === $user) { return null; }   // already minted; the client keeps its copy
        }
        $token = bin2hex(random_bytes(24));
        $all[hash('sha256', $token)] = $user;
        store_write($cfg, widget_tokens_file($cfg), $all);
        return $token;
    });
    // A re-mint replaces nothing: one token per user, handed out once. If it
    // was minted before and lost, rotate by deleting the file server-side.
    if ($t === null) {
        $t = with_lock($cfg, 'widgettokens', function () use ($cfg, $user) {
            $all = store_read($cfg, widget_tokens_file($cfg));
            $all = array_filter($all, fn($u) => $u !== $user);
            $token = bin2hex(random_bytes(24));
            $all[hash('sha256', $token)] = $user;
            store_write($cfg, widget_tokens_file($cfg), $all);
            return $token;
        });
    }
    usage_log($cfg, 'widget_token', $user);
    reply(200, ['ok' => true, 'token' => $t]);
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
            if (isset($hidCals[$cal]) || ($onlyCal !== 'all' && $cal !== $onlyCal)) { continue; }
            foreach ($expand($p['date'] ?? null, $p['repeat'] ?? null) as $d) {
                $days[$d][] = ['kind' => 'event', 'id' => $r['id'], 'text' => $p['text'], 'time' => $p['time'] ?? null];
            }
        }
    }
    // Reminders before events within each day, the suite's widget order.
    foreach ($days as $d => &$rows) {
        usort($rows, fn($a, $b) => ($a['kind'] === $b['kind']) ? strcmp((string) ($a['time'] ?? ''), (string) ($b['time'] ?? '')) : ($a['kind'] === 'reminder' ? -1 : 1));
    }
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
