<?php
/**
 * The server test run — the suite's harness idea: boot `php -S` on a scratch data
 * dir and drive the real endpoint over real HTTP. `php server/tools/test.php`.
 */

$root    = dirname(__DIR__);
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
    require dirname(__DIR__) . '/lib/store.php';
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
t('a tombstone syncs like any edit', function () use ($tokenA, $rec) {
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [$rec('r1', 4000, 'newer', true)]], $tokenA);
    $r = api(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokenA);
    eq(true, $r['body']['changes'][0]['deleted'], 'delete arrived');
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

echo "\n\033[1mwidget feed\033[0m\n";
t('the widget token reads the feed — dated rows in, undated non-riders out', function () use ($tokenA) {
    $dated = ['id' => 'wfeed', 'type' => 'reminder', 'updated' => 8000,
              'payload' => ['text' => 'feed me', 'due' => date('Y-m-d'), 'time' => null, 'done' => false,
                            'repeat' => null, 'folderId' => 'f', 'sectionId' => 's', 'indent' => 0, 'ord' => 'V']];
    $loose = ['id' => 'wloose', 'type' => 'reminder', 'updated' => 8000,
              'payload' => ['text' => 'not on the widget', 'due' => null, 'time' => null, 'done' => false,
                            'repeat' => null, 'folderId' => 'f', 'sectionId' => 's', 'indent' => 0, 'ord' => 'W']];
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [$dated, $loose]], $tokenA);
    $wt = api(['action' => 'widget_token'], $tokenA)['body']['token'];
    ok(strlen($wt) === 48, 'a widget token minted');
    global $port;
    $feed = json_decode((string) @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=$wt"), true);
    ok(!empty($feed['ok']), 'the feed answers the token');
    $texts = [];
    foreach (($feed['days'] ?? []) as $rows) { foreach ($rows as $r) { $texts[] = $r['text']; } }
    ok(in_array('feed me', $texts, true), 'a dated reminder feeds');
    ok(!in_array('not on the widget', $texts, true), 'an undated non-rider stays off the widget');
});
t('a bad feed token is a 401 and a bearer token does not work as one', function () use ($tokenA) {
    global $port;
    $r1 = json_decode((string) @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=" . str_repeat('0', 48)), true);
    ok(empty($r1['ok']), 'garbage refused');
    $r2 = json_decode((string) @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=$tokenA"), true);
    ok(empty($r2['ok']), 'a WRITE bearer token is not a feed token');
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

echo "\n────────────────────────────────\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
