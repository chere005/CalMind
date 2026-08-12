<?php
/**
 * The server test run — the suite's harness idea: boot `php -S` on a scratch data
 * dir and drive the real endpoint over real HTTP. `php server/tools/test.php`.
 */

$root    = dirname(__DIR__);
// The harness asks what day it is and compares that against what the SERVER
// says, so both have to keep the same clock or the run turns red every evening
// between 7pm Chicago and midnight UTC — which is exactly how the missing
// timezone announced itself. The config is read the way app_config() reads it
// rather than including app.php, which would collide with the store the specs
// require directly further down.
$tzCfg = is_file($root . '/lib/config.php') ? require $root . '/lib/config.php' : [];
date_default_timezone_set((string) ($tzCfg['timezone'] ?? 'America/Chicago'));


// Constants only, no state: webauthn.php defines no globals and touches
// nothing, so requiring it here lets a spec name WEBAUTHN_MAX_CHALLENGES
// rather than hardcoding a number that would silently drift from the server's.
require_once $root . '/lib/webauthn.php';
// The data files are ENCRYPTED (store.php, ENC1: + AES). Reading one with
// json_decode returns null, and a spec that then counted `?: []` would pass on
// an empty array while proving nothing — which is exactly how the first
// version of the cap spec below went green against a cap that did not work.
require_once $root . '/lib/store.php';
// Pure functions, no state: the SSRF guard is worth testing directly rather
// than through an endpoint that does not exist yet.
require_once $root . '/lib/fetchurl.php';

$scratch = sys_get_temp_dir() . '/calmind-api-test-' . getmypid();
@mkdir($scratch, 0700, true);

$sock = stream_socket_server('tcp://127.0.0.1:0', $e1, $e2);
$port = (int) explode(':', stream_socket_get_name($sock, false))[1];
fclose($sock);
$srv = proc_open(
    'CALMIND_DATA_DIR=' . escapeshellarg($scratch)
    . ' php -d display_errors=1 -d error_reporting=E_ALL -S 127.0.0.1:' . $port . ' -t ' . escapeshellarg($root . '/public'),
    [1 => ['file', '/dev/null', 'w'], 2 => ['file', $scratch . '/server.log', 'w']],
    $pipes
);
register_shutdown_function(function () use (&$srv, $scratch) {
    if (is_resource($srv)) { proc_terminate($srv); proc_close($srv); }
    @array_map('unlink', glob($scratch . '/*') ?: []);
    @array_map('unlink', glob($scratch . '/.*') ?: []);
    @rmdir($scratch);
});
for ($i = 0; $i < 100; $i++) {
    $c = @fsockopen('127.0.0.1', $port, $x, $y, 0.2);
    if ($c) { fclose($c); break; }
    usleep(100000);
}

$pass = 0; $fail = 0;

function api(array $body, string $token = ''): array
{
    global $port;
    $hdr = "Content-Type: application/json\r\n" . ($token !== '' ? "Authorization: Bearer $token\r\n" : '');
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => $hdr, 'content' => json_encode($body), 'ignore_errors' => true,
    ]]);
    $raw    = (string) @file_get_contents("http://127.0.0.1:$port/api/index.php", false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d{3})#', $h, $m)) { $status = (int) $m[1]; }
    }
    // The harness runs the server with display_errors on: a warning would corrupt
    // the JSON, so decoding doubles as the page-is-quiet check.
    $data = json_decode($raw, true);
    if (!is_array($data)) { throw new RuntimeException("non-JSON reply ($status): " . substr($raw, 0, 200)); }
    return ['status' => $status, 'body' => $data];
}

/**
 * The same POST, but with the Authorization header written out verbatim.
 *
 * api() always spells a correct `Bearer <token>`, which is exactly why nothing
 * noticed that require_auth's anchors were doing no work — every header it had
 * ever been sent was the right shape.
 */
function api_raw_auth(array $body, string $authHeader): array
{
    global $port;
    $hdr = "Content-Type: application/json\r\nAuthorization: $authHeader\r\n";
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => $hdr, 'content' => json_encode($body), 'ignore_errors' => true,
    ]]);
    $raw    = (string) @file_get_contents("http://127.0.0.1:$port/api/index.php", false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d{3})#', $h, $m)) { $status = (int) $m[1]; }
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) { throw new RuntimeException("non-JSON reply ($status): " . substr($raw, 0, 200)); }
    return ['status' => $status, 'body' => $data];
}

function t(string $label, callable $fn): void
{
    global $pass, $fail;
    try { $fn(); $pass++; echo "  \033[32m✓\033[0m $label\n"; }
    catch (Throwable $e) { $fail++; echo "  \033[31m✗ $label — {$e->getMessage()}\033[0m\n"; }
}
function ok($cond, string $why): void { if (!$cond) { throw new RuntimeException($why); } }
function eq($want, $got, string $why = ''): void
{
    if ($want !== $got) { throw new RuntimeException("$why: expected " . var_export($want, true) . ", got " . var_export($got, true)); }
}

$rec = fn(string $id, int $updated, string $text, bool $deleted = false) => [
    'id' => $id, 'type' => 'reminder', 'updated' => $updated, 'deleted' => $deleted,
    'payload' => ['text' => $text, 'due' => null, 'time' => null, 'done' => false,
                  'repeat' => null, 'folderId' => 'f', 'sectionId' => 's', 'indent' => 0, 'ord' => 'V'],
];

echo "\n\033[1maccounts\033[0m\n";
$tokenA = '';
t('signup validates and issues a token', function () use (&$tokenA) {
    eq(400, api(['action' => 'signup', 'username' => 'x', 'email' => 'a@b.c', 'password' => 'longenough'])['status'], 'short name');
    eq(400, api(['action' => 'signup', 'username' => 'alice', 'email' => 'nope', 'password' => 'longenough'])['status'], 'bad email');
    eq(400, api(['action' => 'signup', 'username' => 'alice', 'email' => 'a@b.c', 'password' => 'tiny'])['status'], 'short pass');
    $r = api(['action' => 'signup', 'username' => 'alice', 'email' => 'alice@example.com', 'password' => 'alicepass']);
    eq(200, $r['status'], 'good signup');
    ok(strlen($r['body']['token'] ?? '') === 64, 'token issued');
    $tokenA = $r['body']['token'];
    eq(409, api(['action' => 'signup', 'username' => 'alice', 'email' => 'a@b.c', 'password' => 'longenough'])['status'], 'name taken');
});
t('login checks the hash, and the stored file holds no plaintext', function () use (&$tokenA) {
    eq(401, api(['action' => 'login', 'username' => 'alice', 'password' => 'wrong'])['status'], 'wrong pass');
    $r = api(['action' => 'login', 'username' => 'alice', 'password' => 'alicepass']);
    eq(200, $r['status'], 'right pass');
    global $scratch;
    require_once dirname(__DIR__) . '/lib/store.php';
    $acc = store_read(['data_dir' => $scratch], $scratch . '/accounts.json');
    ok(!str_contains(json_encode($acc), 'alicepass'), 'no plaintext password at rest');
    ok(str_starts_with($acc['alice']['hash'], '$2y$') || str_starts_with($acc['alice']['hash'], '$argon2'), 'a real hash');
});
t('whoami answers the token and rejects garbage', function () use ($tokenA) {
    eq('alice', api(['action' => 'whoami'], $tokenA)['body']['username'], 'whoami');
    eq(401, api(['action' => 'whoami'], str_repeat('0', 64))['status'], 'bad token');
    eq(401, api(['action' => 'whoami'])['status'], 'no token');
});

echo "\n\033[1msync\033[0m\n";
t('push then pull round-trips through the cursor', function () use ($tokenA, $rec) {
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('r1', 1000, 'buy milk')]], $tokenA);
    eq(200, $r['status'], 'push');
    eq(1, count($r['body']['changes']), 'my own push comes back in the tail');
    $cursor = $r['body']['cursor'];
    $r2 = api(['action' => 'sync', 'cursor' => $cursor, 'changes' => []], $tokenA);
    eq(0, count($r2['body']['changes']), 'nothing new past my cursor');
});
t('LWW: the later write wins, the earlier is refused', function () use ($tokenA, $rec) {
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('r1', 3000, 'newer')]], $tokenA);
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('r1', 2000, 'stale')]], $tokenA);
    $texts = array_column(array_column($r['body']['changes'], 'payload'), 'text');
    eq(['newer'], $texts, 'stale write lost');
});
t('an EQUAL stamp with different content is accepted — the server breaks the tie', function () use ($tokenA, $rec) {
    // "Two devices can disagree forever": strictly-newer on both sides meant a
    // tie left every party holding its own copy, silently and permanently,
    // and neither would push again because neither was dirty. Sean's call,
    // 2026-08-11 — the server arbitrates, because it is the one thing both
    // devices agree on. The winner is whichever edit reached here last.
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('tie1', 7000, 'from A')]], $tokenA);
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('tie1', 7000, 'from B')]], $tokenA);
    $byId = [];
    foreach ($r['body']['changes'] as $c) { $byId[$c['id']] = $c; }
    eq('from B', $byId['tie1']['payload']['text'] ?? null, 'the equal-stamped write that arrived second wins');
});
t('an EQUAL stamp with the SAME content is ignored, so echoes do not churn the sequence', function () use ($tokenA, $rec) {
    // Without this, every re-push of a record the server already holds would
    // bump seq and re-broadcast it to every device on every sync — a tie that
    // is not one, forever.
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('echo1', 7100, 'same')]], $tokenA);
    $c1 = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokenA)['body']['cursor'];
    $c2 = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('echo1', 7100, 'same')]], $tokenA)['body']['cursor'];
    eq($c1, $c2, 'an identical re-push does not advance the sequence');
});
t('a superseded tombstone keeps its flag across the round trip', function () use ($tokenA) {
    // The record is REBUILT from a fixed list of keys, so a top-level field
    // that is not named there is dropped without a word. `superseded` marks a
    // tombstone left by a CONVERSION rather than a deletion, so undo does not
    // offer to resurrect something the user never deleted — and it is useless
    // unless it survives a sync. Without the server half this test fails and
    // the client half would have worked on one device and quietly stopped
    // working the moment it synced.
    $conv = ['id' => 'sup1', 'type' => 'reminder', 'updated' => 7300, 'deleted' => true,
             'superseded' => true, 'payload' => ['text' => 'converted away']];
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$conv]], $tokenA);
    $byId = [];
    foreach ($r['body']['changes'] as $c) { $byId[$c['id']] = $c; }
    ok(!empty($byId['sup1']['superseded']), 'the flag comes back');
});
t('…and an ordinary tombstone does not grow one', function () use ($tokenA) {
    // The other half. Without it the test above passes just as well against a
    // server that stamps every record superseded, which would hide every
    // deletion from undo instead of only the conversions.
    $del = ['id' => 'sup2', 'type' => 'reminder', 'updated' => 7310, 'deleted' => true,
            'payload' => ['text' => 'really deleted']];
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$del]], $tokenA);
    $byId = [];
    foreach ($r['body']['changes'] as $c) { $byId[$c['id']] = $c; }
    ok(!empty($byId['sup2']['deleted']), 'it is a tombstone');
    ok(empty($byId['sup2']['superseded']), 'but not a superseded one');
});
t('an unrecognised top-level field is still dropped', function () use ($tokenA) {
    // The default has to STAY the default: naming superseded must not turn the
    // rebuild into a pass-through, or a malformed row becomes stored state.
    $odd = ['id' => 'sup3', 'type' => 'reminder', 'updated' => 7320,
            'nonsense' => 'do not store me', 'payload' => ['text' => 'x']];
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$odd]], $tokenA);
    $byId = [];
    foreach ($r['body']['changes'] as $c) { $byId[$c['id']] = $c; }
    ok(isset($byId['sup3']), 'the record landed');
    ok(!isset($byId['sup3']['nonsense']), 'the stray field did not');
});
t('key ORDER is not content — a reordered payload is still an echo', function () use ($tokenA) {
    // The canonicalisation, checked rather than assumed: a client that
    // serialises the same object in a different order must not read as a
    // conflict on every sync.
    $a = ['id' => 'ord1', 'type' => 'note', 'updated' => 7200,
          'payload' => ['title' => 't', 'body' => 'b', 'folderId' => 'f']];
    $b = ['id' => 'ord1', 'type' => 'note', 'updated' => 7200,
          'payload' => ['folderId' => 'f', 'body' => 'b', 'title' => 't']];
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [$a]], $tokenA);
    $c1 = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokenA)['body']['cursor'];
    $c2 = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$b]], $tokenA)['body']['cursor'];
    eq($c1, $c2, 'the same payload with its keys shuffled is not a difference');
});
t('a tombstone syncs like any edit', function () use ($tokenA, $rec) {
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('r1', 4000, 'newer', true)]], $tokenA);
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokenA);
    // Found by id, not by position. This read changes[0] and so depended on
    // r1 happening to be the lowest sequence in the whole file — adding any
    // test above it moved the tail and failed this one for a reason that had
    // nothing to do with tombstones.
    $byId = [];
    foreach ($r['body']['changes'] as $c) { $byId[$c['id']] = $c; }
    ok(isset($byId['r1']), 'r1 is in the tail at all');
    eq(true, $byId['r1']['deleted'] ?? null, 'delete arrived');
});
t('malformed rows drop; the rest of the batch still lands', function () use ($tokenA, $rec) {
    $bad = ['id' => '../evil', 'type' => 'reminder', 'updated' => 1, 'payload' => null];
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$bad, $rec('r2', 1000, 'good row')]], $tokenA);
    $ids = array_column($r['body']['changes'], 'id');
    ok(!in_array('../evil', $ids, true), 'traversal id refused');
    ok(in_array('r2', $ids, true), 'good row landed');
});
t("users are walls — bob never sees alice's records", function () use ($rec) {
    $tokenB = api(['action' => 'signup', 'username' => 'bob', 'email' => 'bob@example.com', 'password' => 'bobpassword'])['body']['token'];
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokenB);
    eq(0, count($r['body']['changes']), 'empty for bob');
});
t('the cursor only ever advances', function () use ($tokenA, $rec) {
    $c1 = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokenA)['body']['cursor'];
    $c2 = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('r3', 5000, 'later')]], $tokenA)['body']['cursor'];
    ok($c2 > $c1, "a push advances it ($c1 -> $c2)");
    eq($c2, api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokenA)['body']['cursor'], 'a pull leaves it');
});
t('an oversized batch is refused whole; an oversized payload drops alone', function () use ($tokenA, $rec) {
    $batch = array_map(fn($i) => $rec("b$i", 1000, 'x'), range(0, 500));
    eq(400, api(['action' => 'sync', 'cursor' => 0, 'changes' => $batch], $tokenA)['status'], '501 rows is too many');
    $fat = $rec('fat', 1000, str_repeat('x', 70000));
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$fat, $rec('slim', 1000, 'fits')]], $tokenA);
    $ids = array_column($r['body']['changes'], 'id');
    ok(!in_array('fat', $ids, true), 'the fat row was dropped');
    ok(in_array('slim', $ids, true), 'the slim row landed');
});
t('records rest encrypted — ENC1 on disk, no plaintext content', function () use ($scratch) {
    $raw = (string) file_get_contents($scratch . '/records-alice.json');
    ok(str_starts_with($raw, 'ENC1:'), 'the store prefix');
    ok(!str_contains($raw, 'buy milk') && !str_contains($raw, 'newer'), 'no reminder text readable');
});
t('logout revokes exactly that token', function () {
    $t1 = api(['action' => 'login', 'username' => 'bob', 'password' => 'bobpassword'])['body']['token'];
    $t2 = api(['action' => 'login', 'username' => 'bob', 'password' => 'bobpassword'])['body']['token'];
    api(['action' => 'logout'], $t1);
    eq(401, api(['action' => 'whoami'], $t1)['status'], 'the logged-out token is dead');
    eq(200, api(['action' => 'whoami'], $t2)['status'], 'the other device stays signed in');
});

echo "\n\033[1mpasswords\033[0m\n";
t('change_password needs the old one and revokes other tokens', function () use (&$tokenA) {
    eq(403, api(['action' => 'change_password', 'old' => 'wrong', 'new' => 'alicepass2'], $tokenA)['status'], 'wrong old');
    $stale = api(['action' => 'login', 'username' => 'alice', 'password' => 'alicepass'])['body']['token'];
    $r = api(['action' => 'change_password', 'old' => 'alicepass', 'new' => 'alicepass2'], $tokenA);
    eq(200, $r['status'], 'change ok');
    eq(401, api(['action' => 'whoami'], $stale)['status'], 'old session dead');
    $tokenA = $r['body']['token'];
    eq('alice', api(['action' => 'whoami'], $tokenA)['body']['username'], 'fresh token lives');
});
t('recover emails a code that resets the password once', function () use ($scratch) {
    eq(200, api(['action' => 'recover', 'username' => 'nobody'])['status'], 'unknown user leaks nothing');
    api(['action' => 'recover', 'username' => 'alice']);
    preg_match_all('/code=(\d{6})/', (string) file_get_contents($scratch . '/mail.log'), $m);
    $code = end($m[1]);
    ok($code !== false, 'a code was mailed (logged)');
    eq(403, api(['action' => 'reset', 'username' => 'alice', 'code' => '000000' === $code ? '111111' : '000000', 'password' => 'alicepass3'])['status'], 'wrong code');
    $r = api(['action' => 'reset', 'username' => 'alice', 'code' => $code, 'password' => 'alicepass3']);
    eq(200, $r['status'], 'right code resets');
    eq(403, api(['action' => 'reset', 'username' => 'alice', 'code' => $code, 'password' => 'alicepass4'])['status'], 'a code is single-use');
    eq(200, api(['action' => 'login', 'username' => 'alice', 'password' => 'alicepass3'])['status'], 'new password works');
});
t('five wrong codes burn the recovery — the right one no longer works', function () use ($scratch) {
    api(['action' => 'recover', 'username' => 'alice']);
    preg_match_all('/code=(\d{6})/', (string) file_get_contents($scratch . '/mail.log'), $m);
    $code = end($m[1]);
    $wrong = $code === '000000' ? '111111' : '000000';
    for ($i = 0; $i < 5; $i++) {
        api(['action' => 'reset', 'username' => 'alice', 'code' => $wrong, 'password' => 'alicepass9']);
    }
    eq(403, api(['action' => 'reset', 'username' => 'alice', 'code' => $code, 'password' => 'alicepass9'])['status'],
        'exhausted — even the right code is refused');
    eq(200, api(['action' => 'login', 'username' => 'alice', 'password' => 'alicepass3'])['status'], 'the password never moved');
});


echo "\n\033[1msharing\033[0m\n";
$mkUser = function (string $name) {
    $r = api(['action' => 'signup', 'username' => $name, 'email' => "$name@example.com", 'password' => 'longenough1']);
    return (string) $r['body']['token'];
};
$shareRec = fn(array $p, int $u = 1) => ['id' => 'share', 'type' => 'share', 'updated' => $u, 'payload' => $p];
$tokP = ''; $tokQ = '';
t('one-sided naming shares nothing; mutual opens the buckets', function () use ($mkUser, $shareRec, &$tokP, &$tokQ) {
    $tokP = $mkUser('pat');
    $tokQ = $mkUser('quinn');
    // pat owns a folder+section+reminder and a private folder beside them.
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [
        ['id' => 'fs', 'type' => 'folder', 'updated' => 1, 'payload' => ['name' => 'Dinner', 'color' => '#4c8bf0', 'ord' => 'a', 'app' => 'reminders']],
        ['id' => 'ss', 'type' => 'section', 'updated' => 1, 'payload' => ['name' => 'General', 'folderId' => 'fs', 'ord' => 'a']],
        ['id' => 'rs', 'type' => 'reminder', 'updated' => 1, 'payload' => ['text' => 'peel garlic', 'due' => null, 'time' => null, 'done' => false, 'repeat' => null, 'folderId' => 'fs', 'sectionId' => 'ss', 'indent' => 0, 'ord' => 'a']],
        ['id' => 'fp', 'type' => 'folder', 'updated' => 1, 'payload' => ['name' => 'Private', 'color' => '#ea5853', 'ord' => 'b', 'app' => 'reminders']],
        ['id' => 'rp', 'type' => 'reminder', 'updated' => 1, 'payload' => ['text' => 'secret', 'due' => null, 'time' => null, 'done' => false, 'repeat' => null, 'folderId' => 'fp', 'sectionId' => 'ss2', 'indent' => 0, 'ord' => 'a']],
        $shareRec(['partners' => ['quinn'], 'calendars' => [], 'folders' => ['fs'], 'notefolders' => []]),
    ]], $tokP);
    // quinn has not named pat yet: nothing arrives, badge says waiting.
    $r = api(['action' => 'shared_pull'], $tokQ);
    eq(200, $r['status']);
    eq(null, $r['body']['partner'], 'no mutual partner yet');
    // quinn names pat back — now the shared folder flows, the private one never.
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [
        $shareRec(['partners' => ['pat'], 'calendars' => [], 'folders' => [], 'notefolders' => []]),
    ]], $tokQ);
    $r = api(['action' => 'shared_pull'], $tokQ);
    eq('pat', $r['body']['partner']);
    $ids = array_column($r['body']['records'], 'id');
    sort($ids);
    eq(['fs', 'rs', 'ss'], $ids, 'exactly the shared folder, its section, its row');
    // pat sees quinn as mutual now, sharing nothing back yet.
    $r = api(['action' => 'shared_pull'], $tokP);
    eq('quinn', $r['body']['partner']);
    eq([], $r['body']['records'], 'quinn shares no buckets');
});
t('shared_put ticks their row, refuses structure and private rows', function () use (&$tokP, &$tokQ) {
    // quinn ticks pat's shared reminder — allowed, lands in pat's store.
    $r = api(['action' => 'shared_put', 'partner' => 'pat', 'record' =>
        ['id' => 'rs', 'type' => 'reminder', 'updated' => 5, 'payload' => ['text' => 'peel garlic', 'due' => null, 'time' => null, 'done' => true, 'repeat' => null, 'folderId' => 'fs', 'sectionId' => 'ss', 'indent' => 0, 'ord' => 'a']]], $tokQ);
    eq(200, $r['status'], 'tick in shared scope');
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokP);
    $rs = array_values(array_filter($r['body']['changes'], fn($c) => $c['id'] === 'rs'))[0];
    eq(true, $rs['payload']['done'], "the tick is in pat's store");
    // structure is theirs: a section write is refused whatever it says.
    eq(403, api(['action' => 'shared_put', 'partner' => 'pat', 'record' =>
        ['id' => 'ss', 'type' => 'section', 'updated' => 6, 'payload' => ['name' => 'Mine now', 'folderId' => 'fs', 'ord' => 'a']]], $tokQ)['status'], 'structural write');
    // a private row can be neither edited nor dragged into view.
    eq(403, api(['action' => 'shared_put', 'partner' => 'pat', 'record' =>
        ['id' => 'rp', 'type' => 'reminder', 'updated' => 6, 'payload' => ['text' => 'seen', 'due' => null, 'time' => null, 'done' => false, 'repeat' => null, 'folderId' => 'fs', 'sectionId' => 'ss', 'indent' => 0, 'ord' => 'a']]], $tokQ)['status'], 'private row by id');
    eq(403, api(['action' => 'shared_put', 'partner' => 'pat', 'record' =>
        ['id' => 'rnew', 'type' => 'reminder', 'updated' => 6, 'payload' => ['text' => 'sneak', 'due' => null, 'time' => null, 'done' => false, 'repeat' => null, 'folderId' => 'fp', 'sectionId' => 'x', 'indent' => 0, 'ord' => 'a']]], $tokQ)['status'], 'add outside the buckets');
});
t('a shared write breaks an equal-stamp tie the same way sync does', function () use (&$tokP, &$tokQ) {
    // Sean's call, 2026-08-11: the server arbitrates, because it is the one
    // thing both devices agree on. That went into the sync handler and NOT
    // into this one, so the same tie resolved two different ways depending on
    // whose store was being written — quinn's tick on pat's row was dropped on
    // an equal stamp while the API answered ok, and the reconcile pulled back
    // the untouched copy so the tap simply did nothing.
    $row = fn(int $u, bool $done) => ['id' => 'rs', 'type' => 'reminder', 'updated' => $u,
        'payload' => ['text' => 'peel garlic', 'due' => null, 'time' => null, 'done' => $done,
                      'repeat' => null, 'folderId' => 'fs', 'sectionId' => 'ss', 'indent' => 0, 'ord' => 'a']];
    api(['action' => 'shared_put', 'partner' => 'pat', 'record' => $row(8, false)], $tokQ);
    $r = api(['action' => 'shared_put', 'partner' => 'pat', 'record' => $row(8, true)], $tokQ);
    eq(200, $r['status'], 'the equal-stamped write is answered ok');
    $sy = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokP);
    $rs = array_values(array_filter($sy['body']['changes'], fn($c) => $c['id'] === 'rs'))[0];
    eq(true, $rs['payload']['done'], 'and it actually landed');
});
t('…but an equal stamp with the SAME content still changes nothing', function () use (&$tokP, &$tokQ) {
    // The other half, and the reason the tie is on CONTENT rather than on the
    // stamp alone: an echo that bumped the sequence would re-broadcast itself
    // to every device on every sync.
    $same = ['id' => 'rs', 'type' => 'reminder', 'updated' => 8,
        'payload' => ['text' => 'peel garlic', 'due' => null, 'time' => null, 'done' => true,
                      'repeat' => null, 'folderId' => 'fs', 'sectionId' => 'ss', 'indent' => 0, 'ord' => 'a']];
    $before = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokP)['body']['cursor'];
    api(['action' => 'shared_put', 'partner' => 'pat', 'record' => $same], $tokQ);
    $after = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokP)['body']['cursor'];
    eq($before, $after, 'an identical re-push does not advance their sequence');
});
t('removal on either side ends sharing instantly, both ways', function () use ($shareRec, &$tokP, &$tokQ) {
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [
        $shareRec(['partners' => [], 'calendars' => [], 'folders' => [], 'notefolders' => []], 9),
    ]], $tokQ);
    eq(null, api(['action' => 'shared_pull'], $tokQ)['body']['partner'], 'quinn dropped pat');
    eq(null, api(['action' => 'shared_pull'], $tokP)['body']['partner'], 'and pat loses quinn the same instant');
    eq(403, api(['action' => 'shared_put', 'partner' => 'pat', 'record' =>
        ['id' => 'rs', 'type' => 'reminder', 'updated' => 10, 'payload' => ['text' => 'x', 'due' => null, 'time' => null, 'done' => false, 'repeat' => null, 'folderId' => 'fs', 'sectionId' => 'ss', 'indent' => 0, 'ord' => 'a']]], $tokQ)['status'], 'writes die with the handshake');
});

t('an OVERSIZED record is REFUSED by name, not dropped in silence', function () {
    // Its own account: the password specs above revoke the shared token.
    $tok = api(['action' => 'signup', 'username' => 'bigrow', 'email' => 'big@example.com', 'password' => 'bigpassword'])['body']['token'];
    // This used to be a spec documenting a hole: a payload over MAX_PAYLOAD
    // was skipped by the row loop and the reply was still 200 with a fresh
    // cursor, so the client cleared it from dirty and the note lived on that
    // one device while the app called itself synced. 64KB is ~10k words —
    // rare, not impossible, and silent is the worst way for it to fail.
    $big = ['id' => 'toobig', 'type' => 'note', 'updated' => 5,
            'payload' => ['title' => 'huge', 'body' => str_repeat('x', 70000),
                          'date' => null, 'folderId' => 'f', 'sectionId' => 's', 'ord' => 'a']];
    $small = ['id' => 'fine', 'type' => 'note', 'updated' => 5,
              'payload' => ['title' => 'ok', 'body' => 'short', 'date' => null,
                            'folderId' => 'f', 'sectionId' => 's', 'ord' => 'a']];
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$big, $small]], $tok);
    eq(200, $r['status'], 'the rest of the batch still lands');
    $ids = array_column($r['body']['changes'], 'id');
    ok(in_array('fine', $ids, true), 'the ordinary row landed');
    ok(!in_array('toobig', $ids, true), 'the oversized row did NOT');
    eq(['toobig'], $r['body']['rejected'] ?? [], 'and the reply names what it refused');
    // A batch with nothing wrong in it says so plainly rather than omitting
    // the field, so the client never has to guess what absence means.
    $r2 = api(['action' => 'sync', 'cursor' => 0, 'changes' => [$small]], $tok);
    eq([], $r2['body']['rejected'] ?? null, 'an ordinary batch refuses nothing');
});

t('a damaged store file refuses rather than reading as empty', function () {
    // The write is atomic now — temp file then rename — so this should not
    // happen. If it ever does, the failure has to be loud: an unreadable file
    // answering [] looks exactly like an account with no records, and the very
    // next sync would persist that and turn damage into deletion.
    $tok  = api(['action' => 'signup', 'username' => 'bent', 'email' => 'bent@example.com', 'password' => 'bentpassword'])['body']['token'];
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [
        ['id' => 'keepme', 'type' => 'note', 'updated' => 9100,
         'payload' => ['title' => 'keep me', 'body' => '', 'date' => null,
                       'folderId' => 'f', 'sectionId' => 's', 'ord' => 'a']],
    ]], $tok);
    global $scratch;
    $file = $scratch . '/records-bent.json';
    ok(is_file($file), 'the records file exists');

    // Truncate it the way a killed process would.
    $whole = (string) file_get_contents($file);
    file_put_contents($file, substr($whole, 0, 24));
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tok);
    ok($r['status'] >= 500, 'a truncated file is an error, not an empty account — got ' . $r['status']);

    // Put it back and the records are still there, which is the point: the
    // damage was refused rather than written over.
    file_put_contents($file, $whole);
    $back = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tok);
    eq(200, $back['status'], 'and it reads again once whole');
    ok(in_array('keepme', array_column($back['body']['changes'], 'id'), true), 'the note survived');
});

t('a write leaves no temp files behind', function () {
    global $scratch;
    $strays = glob($scratch . '/*.tmp') ?: [];
    eq([], $strays, 'no .tmp residue from the atomic writes');
});

t('the mail log records whether the code could be sent, not just that it exists', function () {
    // recover always answers ok — which usernames exist is nobody's business —
    // so a user who never gets a code cannot be told why. The log is the only
    // place the truth can live, and it used to say only that a code had been
    // issued, never whether it had a hope of arriving.
    $u = 'maily' . substr((string) time(), -5);
    api(['action' => 'signup', 'username' => $u, 'email' => $u . '@example.com', 'password' => 'mailypassword']);
    api(['action' => 'recover', 'username' => $u]);
    global $scratch;
    $log = (string) @file_get_contents($scratch . '/mail.log');
    ok(str_contains($log, $u . '@example.com'), 'the address is logged');
    ok(str_contains($log, 'log-only') || str_contains($log, 'mailed') || str_contains($log, 'MAIL REFUSED'),
       'and how it went: this host does not send, so log-only');
});

t('the usage log rotates instead of growing forever', function () {
    // Every device polls every thirty seconds, so this file gained a couple of
    // thousand lines a day per device and nothing ever read the whole thing to
    // notice. One rotation at 5MB keeps months of history and a bounded disk.
    global $scratch;
    $path = $scratch . '/usage.log';
    @unlink($path . '.1');
    file_put_contents($path, str_repeat("x\n", 3 * 1024 * 1024));  // over the cap
    // The harness drives HTTP and never loads app.php, so USAGE_LOG_MAX is not
    // in scope here; 5MB is written out with its name beside it.
    ok(filesize($path) > 5 * 1024 * 1024, 'the log is over USAGE_LOG_MAX (5MB) to begin with');

    $u = 'rot' . substr((string) time(), -5);
    api(['action' => 'signup', 'username' => $u, 'email' => $u . '@example.com', 'password' => 'rotpassword']);

    ok(is_file($path . '.1'), 'the old log was set aside');
    ok(filesize($path) < 1024, 'and the live one starts fresh — got ' . filesize($path));
    $fresh = (string) file_get_contents($path);
    ok(str_contains($fresh, 'signup'), 'with the action that triggered it');
});

t('the URL fetcher refuses the addresses a server must never be asked for', function () {
    // A URL typed into an app becomes a request made BY THE SERVER, from
    // inside the host, so it can reach places the person typing cannot. These
    // are the ones that matter, including the cloud metadata address, which is
    // the classic target and sits in no private range.
    foreach (['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '0.0.0.0'] as $ip) {
        ok(fetch_ip_is_private($ip), "$ip is refused");
    }
    ok(!fetch_ip_is_private('93.184.216.34'), 'a public address is allowed');

    foreach (['http://127.0.0.1/x', 'https://localhost/x', 'http://169.254.169.254/latest/meta-data'] as $u) {
        $r = fetch_url($u);
        ok(!$r['ok'], "refused: $u");
        ok(str_contains($r['error'], 'not one this server will fetch'), "and says why: $u — got '{$r['error']}'");
    }

    // Not a URL, and not a scheme we speak. file:// is the one that reads the
    // disk if nobody checks.
    eq(false, fetch_url('file:///etc/passwd')['ok'], 'file:// is refused');
    eq(false, fetch_url('notaurl')['ok'], 'nonsense is refused');
    ok(str_contains(fetch_url('file:///etc/passwd')['error'], 'only http'), 'and says which schemes it speaks');
});

t('an empty or unwritable data key REFUSES, instead of encrypting with a public one', function () use ($scratch) {
    // store_key used to fall through to hash('sha256', '') whenever the key
    // file could not be read — the hash of the empty string, a constant
    // anybody can compute. Two ways in, both silent: a data dir that cannot
    // be written to, and a .datakey left empty by an interrupted write.
    //
    // It costs the data as well as the secrecy. Once a real key is written
    // later, everything encrypted under the empty-string one stops
    // decrypting, and store_read refuses it for ever — correctly.
    $public = hash('sha256', '', true);

    // A working directory still mints a real, stable key.
    $ok = $scratch . '/keyok';
    @mkdir($ok, 0700, true);
    $k1 = store_key(['data_dir' => $ok]);
    eq($k1, store_key(['data_dir' => $ok]), 'the key is stable across calls');
    ok($k1 !== $public, 'and is not the empty-string hash');

    // An EMPTY .datakey — the truncated-write case.
    $empty = $scratch . '/keyempty';
    @mkdir($empty, 0700, true);
    file_put_contents($empty . '/.datakey', '');
    $threw = false;
    try { store_key(['data_dir' => $empty]); } catch (Throwable $e) { $threw = true; }
    ok($threw, 'an empty data key must be refused, not silently replaced by a public one');

    // An explicit key in the config is unaffected — that path never touches
    // the file, and breaking it would break every deployment that sets one.
    $viaCfg = store_key(['data_dir' => $empty, 'data_key' => 'a real configured secret']);
    ok($viaCfg !== $public, 'a configured data_key still works and is not the public hash');
});

t('a store write that cannot be encoded REFUSES, instead of wiping the account', function () use ($scratch) {
    // json_encode returns false rather than throwing, and the old code handed
    // that straight to openssl_encrypt: the empty string was encrypted and
    // written, producing a file that announces ENC1, base64-decodes,
    // decrypts, and json_decodes to null — which store_read answers as an
    // account with no records. Every layer says fine and the data is gone.
    //
    // store_read cannot catch this and it is not its fault: there is nothing
    // wrong with the file. The refusal has to be at the write.
    $dir  = $scratch . '/encodefail';
    @mkdir($dir, 0700, true);
    $cfg  = ['data_dir' => $dir, 'store_key' => str_repeat('k', 32)];
    $file = $dir . '/store.json';

    store_write($cfg, $file, ['records' => [['id' => 'a', 'text' => 'a real note']]]);
    eq(1, count(store_read($cfg, $file)['records']), 'the good write lands');
    $goodBytes = file_get_contents($file);

    // An invalid UTF-8 byte: json_encode's commonest refusal.
    $threw = false;
    try {
        store_write($cfg, $file, ['records' => [['id' => 'a', 'text' => "bad \xB1\x31 byte"]]]);
    } catch (Throwable $e) {
        $threw = true;
    }
    ok($threw, 'store_write must refuse a payload it cannot encode');

    // The point of refusing: the previous file is untouched, because the
    // write is a temp file plus a rename and we never reached the rename.
    eq($goodBytes, file_get_contents($file), 'the last good file is still on disk, byte for byte');
    eq(1, count(store_read($cfg, $file)['records']), 'and still reads back as one record');
});

t('with_lock actually serialises writers', function () use ($scratch, $root) {
    // Dropping flock(LOCK_EX) failed nothing — found by mutation, 2026-08-11.
    // Nothing here had ever run two writers at once, and it cannot be done
    // through the API either: php -S serialises requests all by itself, so a
    // parallel HTTP test would prove the dev server's behaviour, not the
    // lock's. Real processes against with_lock directly is the only way to
    // make the race happen.
    //
    // The shape that loses data is read-modify-write: two workers read the
    // same number, both add one, and one increment is gone. usleep widens that
    // window so the unlocked version fails every time rather than occasionally
    // — a flaky demonstration would be no demonstration.
    $worker = $scratch . '/lockworker.php';
    file_put_contents($worker, '<?php
require_once $argv[1] . "/lib/store.php";
$cfg  = ["data_dir" => $argv[2]];
$file = $argv[2] . "/lockcount.json";
for ($i = 0; $i < 40; $i++) {
    with_lock($cfg, "counttest", function () use ($cfg, $file) {
        $d = store_read($cfg, $file);
        $n = (int) ($d["n"] ?? 0);
        usleep(500);
        store_write($cfg, $file, ["n" => $n + 1]);
    });
}
');
    $cfg  = ['data_dir' => $scratch];
    $file = $scratch . '/lockcount.json';
    store_write($cfg, $file, ['n' => 0]);

    $procs = [];
    for ($k = 0; $k < 4; $k++) {
        $procs[] = proc_open(
            'php ' . escapeshellarg($worker) . ' ' . escapeshellarg($root) . ' ' . escapeshellarg($scratch),
            [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
            $pipes,
        );
    }
    foreach ($procs as $p) { if (is_resource($p)) { proc_close($p); } }

    eq(160, (int) (store_read($cfg, $file)['n'] ?? 0), 'every increment survived — four writers, forty each');
});

t('the origin check gives its exception to localhost ONLY', function () {
    // webauthn_origin_ok had no direct test, and the passkey spec above cannot
    // stand in for one: this harness EXPECTS http://127.0.0.1:$port, and the
    // foreign origin it tries differs in port as well as host, so the port
    // comparison refuses it and the host restriction is never exercised.
    // Widening the localhost test to `fn($h) => true` therefore passed the
    // whole suite while accepting https://evil.example as
    // https://calmind.example — found by mutation, 2026-08-11.
    //
    // The exception exists because a browser at http://localhost:8081 and one
    // at http://127.0.0.1:8081 are the same place, and dev moves between them.
    // Everything about that is narrow on purpose: same port, and both ends
    // one of those two names.
    ok(webauthn_origin_ok('https://calmind.example', 'https://calmind.example'), 'an exact match is fine');
    ok(!webauthn_origin_ok('https://evil.example', 'https://calmind.example'), 'a different host is not, ports or no ports');
    ok(!webauthn_origin_ok('https://calmind.example.evil', 'https://calmind.example'), 'nor a suffix of the real one');
    ok(!webauthn_origin_ok('http://calmind.example', 'https://calmind.example'), 'nor the same host over http');

    ok(webauthn_origin_ok('http://127.0.0.1:8081', 'http://localhost:8081'), 'localhost and 127.0.0.1 are the same place');
    ok(webauthn_origin_ok('http://localhost:8081', 'http://127.0.0.1:8081'), 'in either direction');
    ok(!webauthn_origin_ok('http://localhost:3000', 'http://localhost:8081'), 'but not across ports');
    ok(!webauthn_origin_ok('http://evil.example:8081', 'http://localhost:8081'), 'and the exception is for those two names only');

    ok(!webauthn_origin_ok('', 'https://calmind.example'), 'an empty origin is refused');
    ok(!webauthn_origin_ok('not a url', 'https://calmind.example'), 'and so is nonsense');
});

t('a redirect resolves to the address it actually means', function () {
    // The redirect branch had NO cover: mutation replaced the recursive call
    // with a function that does not exist and every spec still passed, because
    // a redirect cannot be driven locally — every server this harness can
    // reach is on 127.0.0.1, which the address guard refuses first. The
    // resolution arithmetic is testable on its own, so it is its own function
    // now and this is it.
    $u = parse_url('https://example.com:8443/a/b');

    eq('https://other.example/x', fetch_next_url($u, 'https://other.example/x'), 'an absolute Location is taken as it stands');
    eq('http://other.example/x', fetch_next_url($u, 'http://other.example/x'), 'including one that drops to http');

    // THE PORT. 'https://example.com:8443/a/b' -> '/c' used to answer
    // 'https://example.com/c': port 443, a different service on the same host,
    // fetched with nobody the wiser.
    eq('https://example.com:8443/c', fetch_next_url($u, '/c'), 'a rooted Location keeps the port');
    eq('https://example.com:8443/c', fetch_next_url($u, 'c'), 'and so does a bare one, which also gains its slash');

    // Protocol-relative: '//host/x' means "same scheme, that host". It is not
    // matched by ^https?:// so it used to be pasted on as a path, giving
    // 'https://example.com//other.example/x' — safe, since it stayed on a host
    // already checked, and quietly not what the server asked for.
    eq('https://other.example/x', fetch_next_url($u, '//other.example/x'), 'protocol-relative takes the scheme and the host it names');

    // A host with no port keeps the shape it had.
    eq('https://example.com/c', fetch_next_url(parse_url('https://example.com/a'), '/c'), 'no port, none invented');

    // And whatever it resolves to still goes back through fetch_url, so a
    // redirect aimed at a private address is refused like a direct one.
    eq('http://127.0.0.1/x', fetch_next_url($u, 'http://127.0.0.1/x'), 'a private target resolves…');
    eq(false, fetch_url('http://127.0.0.1/x')['ok'], '…and is then refused by the same guard as any other');
});

t('recipe_fetch: the ENDPOINT is behind auth and behind the address guard', function () {
    // The tests above drive fetch_url() directly, and the browser specs mock
    // this action out entirely — so between them, nothing ran the actual
    // endpoint. A handler that stopped calling fetch_url, or dropped
    // require_auth, would have left every one of them green while the server
    // became an unauthenticated proxy that fetches whatever it is told to.
    // What is being checked here is the WIRING, not the guard.
    $u = 'chef' . substr((string) mt_rand(), 0, 6);
    $tok = api(['action' => 'signup', 'username' => $u, 'email' => $u . '@example.com', 'password' => 'recipepassword'])['body']['token'] ?? '';
    ok($tok !== '', 'signed up for a token');

    // No token at all: a URL fetcher anyone can aim is the whole problem.
    eq(401, api(['action' => 'recipe_fetch', 'url' => 'https://example.com/'])['status'], 'refused without a token');

    // With a token, the private addresses must STILL be refused — and the
    // reason has to be the guard's, which is what proves the handler goes
    // through it rather than round it.
    foreach (['http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data', 'https://localhost/x'] as $bad) {
        $r = api(['action' => 'recipe_fetch', 'url' => $bad], $tok);
        eq(400, $r['status'], "refused: $bad");
        ok(str_contains((string) ($r['body']['error'] ?? ''), 'not one this server will fetch'),
            "and for the guard's reason: $bad — got '" . ($r['body']['error'] ?? '') . "'");
    }
    // file:// reads the disk if nobody checks the scheme.
    $f = api(['action' => 'recipe_fetch', 'url' => 'file:///etc/passwd'], $tok);
    eq(400, $f['status'], 'file:// refused at the endpoint');
    ok(str_contains((string) ($f['body']['error'] ?? ''), 'only http'), 'and says which schemes it speaks');

    // An empty url is a 400 with a message, not a 500 and not a blank one —
    // a message that says nothing is how a real failure looked like nothing
    // happening at all.
    $e = api(['action' => 'recipe_fetch', 'url' => ''], $tok);
    eq(400, $e['status'], 'an empty url is a 400');
    ok(trim((string) ($e['body']['error'] ?? '')) !== '', 'and carries a reason');
});

t("the server's day is Chicago's, not UTC", function () {
    // Anything here that asks what day it is gets this answer. Left on UTC it
    // turned over at 7pm Chicago, so every server-decided date was a day early
    // all evening. Found through the widget feed, since removed; repeats and
    // dated reads still ask, so the rule outlived the thing that exposed it.
    eq('America/Chicago', date_default_timezone_get(), 'the default the config can move');
    // And the answer itself: the server's date must equal Chicago's date,
    // which is the thing that actually bit — not merely a string setting.
    $chicago = (new DateTime('now', new DateTimeZone('America/Chicago')))->format('Y-m-d');
    eq($chicago, date('Y-m-d'), "date('Y-m-d') is the Chicago day");
});

// ---------------------------------------------------------------- passkeys
//
// A software authenticator, so the ceremony is driven end to end rather than
// mocked at the seam where the bugs live. It generates a real P-256 key,
// builds real CBOR, and signs what a browser would sign.

function cbor_uint_e(int $n, int $major = 0): string
{
    $m = $major << 5;
    if ($n < 24)    { return chr($m | $n); }
    if ($n < 256)   { return chr($m | 24) . chr($n); }
    if ($n < 65536) { return chr($m | 25) . pack('n', $n); }
    return chr($m | 26) . pack('N', $n);
}
function cbor_int_e(int $n): string { return $n >= 0 ? cbor_uint_e($n) : cbor_uint_e(-1 - $n, 1); }
function cbor_bytes_e(string $b): string { return cbor_uint_e(strlen($b), 2) . $b; }
function cbor_text_e(string $t): string { return cbor_uint_e(strlen($t), 3) . $t; }
function cbor_map_e(array $pairs): string
{
    $out = cbor_uint_e(count($pairs), 5);
    foreach ($pairs as [$k, $v]) { $out .= $k . $v; }
    return $out;
}

/** Returns [privateKeyResource, coseKeyBytes]. */
function fake_authenticator_key(): array
{
    $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    $d   = openssl_pkey_get_details($key);
    $x   = str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT);
    $y   = str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
    $cose = cbor_map_e([
        [cbor_int_e(1), cbor_int_e(2)],       // kty: EC2
        [cbor_int_e(3), cbor_int_e(-7)],      // alg: ES256
        [cbor_int_e(-1), cbor_int_e(1)],      // crv: P-256
        [cbor_int_e(-2), cbor_bytes_e($x)],
        [cbor_int_e(-3), cbor_bytes_e($y)],
    ]);
    return [$key, $cose];
}

function fake_authdata(string $rpId, int $flags, int $count, string $credId = '', string $cose = ''): string
{
    $out = hash('sha256', $rpId, true) . chr($flags) . pack('N', $count);
    if ($credId !== '') {
        $out .= str_repeat("\0", 16) . pack('n', strlen($credId)) . $credId . $cose;
    }
    return $out;
}

function fake_client_data(string $type, string $challenge, string $origin): string
{
    return json_encode(['type' => $type, 'challenge' => $challenge, 'origin' => $origin], JSON_UNESCAPED_SLASHES);
}

$pkUser = 'pk' . substr((string) time(), -6);
$pkTok  = api(['action' => 'signup', 'username' => $pkUser, 'email' => $pkUser . '@example.com', 'password' => 'passkeypw'])['body']['token'] ?? '';
$pkOrigin = "http://127.0.0.1:$port";
$pkRp     = '127.0.0.1';
[$pkKey, $pkCose] = fake_authenticator_key();
$pkCredId = random_bytes(32);
$pkId     = rtrim(strtr(base64_encode($pkCredId), '+/', '-_'), '=');
$b64u     = fn(string $b) => rtrim(strtr(base64_encode($b), '+/', '-_'), '=');

t('a passkey registers against a real ceremony', function () use ($pkTok, $pkOrigin, $pkRp, $pkCose, $pkCredId, $pkId, $b64u) {
    $begin = api(['action' => 'passkey_register_begin'], $pkTok);
    eq(200, $begin['status'], 'register_begin');
    eq($pkRp, $begin['body']['rp']['id'] ?? '', 'the RP id is derived from the host');
    $cd  = fake_client_data('webauthn.create', $begin['body']['challenge'], $pkOrigin);
    $ad  = fake_authdata($pkRp, 0x45, 0, $pkCredId, $pkCose);
    $att = cbor_map_e([
        [cbor_text_e('fmt'), cbor_text_e('none')],
        [cbor_text_e('attStmt'), cbor_map_e([])],
        [cbor_text_e('authData'), cbor_bytes_e($ad)],
    ]);
    $fin = api([
        'action' => 'passkey_register_finish', 'label' => 'test key',
        'clientDataJSON' => $b64u($cd), 'attestationObject' => $b64u($att),
    ], $pkTok);
    eq(200, $fin['status'], 'register_finish: ' . json_encode($fin['body']));
    eq($pkId, $fin['body']['id'] ?? '', 'the credential id comes back');

    $list = api(['action' => 'passkey_list'], $pkTok);
    eq(1, count($list['body']['passkeys'] ?? []), 'one passkey on the account');
    eq('test key', $list['body']['passkeys'][0]['label'] ?? '', 'it kept its label');
});

t('registration will not take a challenge twice', function () use ($pkTok, $pkOrigin, $pkRp, $pkCose, $b64u) {
    $begin = api(['action' => 'passkey_register_begin'], $pkTok);
    $cd    = fake_client_data('webauthn.create', $begin['body']['challenge'], $pkOrigin);
    $id2   = random_bytes(32);
    $att   = cbor_map_e([
        [cbor_text_e('fmt'), cbor_text_e('none')],
        [cbor_text_e('attStmt'), cbor_map_e([])],
        [cbor_text_e('authData'), cbor_bytes_e(fake_authdata($pkRp, 0x45, 0, $id2, $pkCose))],
    ]);
    $body = ['action' => 'passkey_register_finish', 'clientDataJSON' => $b64u($cd), 'attestationObject' => $b64u($att)];
    eq(200, api($body, $pkTok)['status'], 'first use');
    eq(400, api($body, $pkTok)['status'], 'the same challenge again is refused');
    api(['action' => 'passkey_remove', 'id' => $b64u($id2)], $pkTok);
});

t('a passkey signs in without a username, and the token works', function () use ($pkKey, $pkOrigin, $pkRp, $pkId, $pkUser, $b64u) {
    $begin = api(['action' => 'passkey_login_begin']);
    eq(200, $begin['status'], 'login_begin needs no auth');
    $cd = fake_client_data('webauthn.get', $begin['body']['challenge'], $pkOrigin);
    $ad = fake_authdata($pkRp, 0x05, 1);
    openssl_sign($ad . hash('sha256', $cd, true), $sig, $pkKey, OPENSSL_ALGO_SHA256);
    $fin = api([
        'action' => 'passkey_login_finish', 'id' => $pkId,
        'clientDataJSON' => $b64u($cd), 'authenticatorData' => $b64u($ad), 'signature' => $b64u($sig),
    ]);
    eq(200, $fin['status'], 'login_finish: ' . json_encode($fin['body']));
    eq($pkUser, $fin['body']['username'] ?? '', 'the authenticator said who it was');
    $who = api(['action' => 'whoami'], $fin['body']['token']);
    eq($pkUser, $who['body']['username'] ?? '', 'and the token it issued is a real one');
});

t('a tampered signature, a foreign origin and a stale challenge are all refused', function () use ($pkKey, $pkOrigin, $pkRp, $pkId, $b64u) {
    // Tampered signature.
    $b1 = api(['action' => 'passkey_login_begin']);
    $cd = fake_client_data('webauthn.get', $b1['body']['challenge'], $pkOrigin);
    $ad = fake_authdata($pkRp, 0x05, 2);
    openssl_sign($ad . hash('sha256', $cd, true), $sig, $pkKey, OPENSSL_ALGO_SHA256);
    $bad = $sig;
    $bad[strlen($bad) - 1] = chr(ord($bad[strlen($bad) - 1]) ^ 0x01);
    eq(401, api(['action' => 'passkey_login_finish', 'id' => $pkId, 'clientDataJSON' => $b64u($cd),
        'authenticatorData' => $b64u($ad), 'signature' => $b64u($bad)])['status'], 'a bent signature');

    // A page on another origin, signing a genuine challenge.
    $b2  = api(['action' => 'passkey_login_begin']);
    $cd2 = fake_client_data('webauthn.get', $b2['body']['challenge'], 'https://evil.example');
    $ad2 = fake_authdata($pkRp, 0x05, 3);
    openssl_sign($ad2 . hash('sha256', $cd2, true), $sig2, $pkKey, OPENSSL_ALGO_SHA256);
    eq(400, api(['action' => 'passkey_login_finish', 'id' => $pkId, 'clientDataJSON' => $b64u($cd2),
        'authenticatorData' => $b64u($ad2), 'signature' => $b64u($sig2)])['status'], 'a foreign origin');

    // A challenge that was already spent.
    $b3  = api(['action' => 'passkey_login_begin']);
    $cd3 = fake_client_data('webauthn.get', $b3['body']['challenge'], $pkOrigin);
    $ad3 = fake_authdata($pkRp, 0x05, 4);
    openssl_sign($ad3 . hash('sha256', $cd3, true), $sig3, $pkKey, OPENSSL_ALGO_SHA256);
    $replay = ['action' => 'passkey_login_finish', 'id' => $pkId, 'clientDataJSON' => $b64u($cd3),
        'authenticatorData' => $b64u($ad3), 'signature' => $b64u($sig3)];
    eq(200, api($replay)['status'], 'the first use');
    eq(400, api($replay)['status'], 'the replay');
});

t('a passkey that was not UNLOCKED on the device is refused', function () use ($pkKey, $pkOrigin, $pkRp, $pkId, $b64u) {
    // POSITION IS LOAD-BEARING, twice, and both were found by getting it wrong.
    // Placed AFTER the counter-regression spec, all three refusals still
    // passed — for the wrong reason, because that spec REMOVES the passkey at
    // the end and a 401 'not recognised' reads exactly like a 401 'not
    // verified'. The positive case below is the only thing that exposed it.
    // And that positive case signs in for real, advancing the stored
    // signCount, so it uses 8: above this spec's own attempts, below the 9 the
    // counter spec needs to succeed with, and above the 2 it needs refused.
    //
    // The flags byte carries UP (0x01, someone touched it) and UV (0x04,
    // someone proved it was them — a face, a fingerprint, a PIN). Every other
    // passkey spec here sends 0x05, both set, so the guard requiring them was
    // never exercised: removing it outright failed nothing. Found by mutation,
    // 2026-08-11.
    //
    // It is the server's only say in the matter. The flags come from the
    // client, which is untrusted by definition, so "a real authenticator sets
    // them properly" is not a check — it is a hope. Everything else about
    // these assertions is valid: the signature is genuine, over this exact
    // authenticator data, for a fresh challenge. Only the flags differ.
    foreach ([[0x01, 'user present but never verified'], [0x04, 'verified but never touched'], [0x00, 'neither']] as [$flags, $why]) {
        $begin = api(['action' => 'passkey_login_begin']);
        $cd = fake_client_data('webauthn.get', $begin['body']['challenge'], $pkOrigin);
        $ad = fake_authdata($pkRp, $flags, 8);
        openssl_sign($ad . hash('sha256', $cd, true), $sig, $pkKey, OPENSSL_ALGO_SHA256);
        $r = api([
            'action' => 'passkey_login_finish', 'id' => $pkId,
            'clientDataJSON' => $b64u($cd), 'authenticatorData' => $b64u($ad), 'signature' => $b64u($sig),
        ]);
        eq(401, $r['status'], "flags 0x" . dechex($flags) . " — $why");
    }
    // And the same assertion with BOTH flags set still signs in, so this is
    // not simply "refuse everything".
    $begin = api(['action' => 'passkey_login_begin']);
    $cd = fake_client_data('webauthn.get', $begin['body']['challenge'], $pkOrigin);
    $ad = fake_authdata($pkRp, 0x05, 8);
    openssl_sign($ad . hash('sha256', $cd, true), $sig, $pkKey, OPENSSL_ALGO_SHA256);
    eq(200, api([
        'action' => 'passkey_login_finish', 'id' => $pkId,
        'clientDataJSON' => $b64u($cd), 'authenticatorData' => $b64u($ad), 'signature' => $b64u($sig),
    ])['status'], 'a properly unlocked passkey still works');
});


t('a counter that goes backwards is refused, and a removed passkey stops working', function () use ($pkKey, $pkOrigin, $pkRp, $pkId, $pkTok, $b64u) {
    // The stored counter is at 4 after the last test; 2 is a clone's answer.
    $b1 = api(['action' => 'passkey_login_begin']);
    $cd = fake_client_data('webauthn.get', $b1['body']['challenge'], $pkOrigin);
    $ad = fake_authdata($pkRp, 0x05, 2);
    openssl_sign($ad . hash('sha256', $cd, true), $sig, $pkKey, OPENSSL_ALGO_SHA256);
    eq(401, api(['action' => 'passkey_login_finish', 'id' => $pkId, 'clientDataJSON' => $b64u($cd),
        'authenticatorData' => $b64u($ad), 'signature' => $b64u($sig)])['status'], 'counter went backwards');

    eq(200, api(['action' => 'passkey_remove', 'id' => $pkId], $pkTok)['status'], 'remove');
    $b2  = api(['action' => 'passkey_login_begin']);
    $cd2 = fake_client_data('webauthn.get', $b2['body']['challenge'], $pkOrigin);
    $ad2 = fake_authdata($pkRp, 0x05, 9);
    openssl_sign($ad2 . hash('sha256', $cd2, true), $sig2, $pkKey, OPENSSL_ALGO_SHA256);
    eq(401, api(['action' => 'passkey_login_finish', 'id' => $pkId, 'clientDataJSON' => $b64u($cd2),
        'authenticatorData' => $b64u($ad2), 'signature' => $b64u($sig2)])['status'], 'a removed passkey');
});

t('the challenge store cannot be grown without limit by anyone', function () use ($pkOrigin, $pkRp) {
    // passkey_login_begin takes no token — deliberately, since asking who you
    // are before a discoverable login would leak which names exist. That makes
    // it the one endpoint a stranger can make write to disk, and every other
    // request on the server reads and rewrites that same file.
    for ($i = 0; $i < 240; $i++) {
        api(['action' => 'passkey_login_begin']);
    }
    global $scratch;
    $cfg = ['data_dir' => $scratch];
    $all = store_read($cfg, $scratch . '/challenges.json');
    ok(count($all) > 0, 'the challenge file is actually being read (it is encrypted)');
    ok(count($all) <= WEBAUTHN_MAX_CHALLENGES, 'the file is capped, not merely aged out — got ' . count($all));
    // And the cap keeps the NEWEST, so a ceremony started a moment ago still
    // completes while the flood's own challenges are the ones evicted.
    $begin = api(['action' => 'passkey_login_begin']);
    $all2 = store_read($cfg, $scratch . '/challenges.json');
    ok(isset($all2[$begin['body']['challenge']]), 'the challenge just issued survived the cap');
});

t('the password is still a way in', function () use ($pkUser) {
    // Passkeys are an addition, not a replacement: losing one must not lock
    // anyone out of their own account.
    $r = api(['action' => 'login', 'username' => $pkUser, 'password' => 'passkeypw']);
    eq(200, $r['status'], 'password login still works after a passkey exists');
});

t('the Authorization header must BE a bearer token, not merely contain one', function () use ($pkUser) {
    // require_auth anchors its match: ^Bearer <64 hex>$. Loosening it to a
    // bare search passed every test here — found by mutation, 2026-08-11 —
    // because nothing ever sent a header of the wrong shape carrying a real
    // token. Low stakes on its own (you still need the secret) and worth a
    // line anyway: the anchors are the difference between a header this
    // server defines and any string a proxy or a client library might put
    // there.
    $r = api(['action' => 'login', 'username' => $pkUser, 'password' => 'passkeypw']);
    eq(200, $r['status'], 'a password login to get a real token');
    $tok = $r['body']['token'];
    eq(200, api(['action' => 'whoami'], $tok)['status'], 'the token itself works');
    foreach (['Basic ' . $tok, 'Bearer ' . $tok . ' extra', 'x' . $tok, $tok] as $hdr) {
        eq(401, api_raw_auth(['action' => 'whoami'], $hdr)['status'], "header: $hdr");
    }
});


echo "\n────────────────────────────────\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
