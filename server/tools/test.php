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
    // rotate: these specs want a usable key, not the "you already have one"
    // answer that a second plain call now (correctly) gives.
    $wt = api(['action' => 'widget_token', 'rotate' => true], $tokenA)['body']['token'];
    ok(strlen($wt) === 48, 'a widget token minted');
    global $port;
    $feed = json_decode((string) @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=$wt"), true);
    ok(!empty($feed['ok']), 'the feed answers the token');
    $texts = [];
    foreach (($feed['days'] ?? []) as $rows) { foreach ($rows as $r) { $texts[] = $r['text']; } }
    ok(in_array('feed me', $texts, true), 'a dated reminder feeds');
    ok(!in_array('not on the widget', $texts, true), 'an undated non-rider stays off the widget');
});
t('the feed follows the suite: rolled repeats keep future dates, hidden folders drop out', function () use ($tokenA) {
    global $port;
    $lastWeek = date('Y-m-d', strtotime('-7 days'));
    $rows = [
        // Overdue weekly repeat: today (rolled) AND its next date inside the window.
        ['id' => 'wrep', 'type' => 'reminder', 'updated' => 8100,
         'payload' => ['text' => 'water ferns', 'due' => $lastWeek, 'time' => null, 'done' => false,
                       'repeat' => ['n' => 1, 'unit' => 'week'], 'folderId' => 'f', 'sectionId' => 's', 'indent' => 0, 'ord' => 'X']],
        // A folder switched off in prefs: its reminder never feeds.
        ['id' => 'fhid', 'type' => 'folder', 'updated' => 8100, 'payload' => ['name' => 'Hidden', 'color' => '#929aaa', 'ord' => 'z', 'app' => 'reminders']],
        ['id' => 'whid', 'type' => 'reminder', 'updated' => 8100,
         'payload' => ['text' => 'invisible', 'due' => date('Y-m-d'), 'time' => null, 'done' => false,
                       'repeat' => null, 'folderId' => 'fhid', 'sectionId' => 's', 'indent' => 0, 'ord' => 'Y']],
        ['id' => 'prefs_reminders', 'type' => 'pref', 'updated' => 8100, 'payload' => ['hidden' => ['fhid']]],
    ];
    api(['action' => 'sync', 'cursor' => 0, 'changes' => $rows], $tokenA);
    // rotate: these specs want a usable key, not the "you already have one"
    // answer that a second plain call now (correctly) gives.
    $wt = api(['action' => 'widget_token', 'rotate' => true], $tokenA)['body']['token'];
    $feed = json_decode((string) @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=$wt"), true);
    $today = date('Y-m-d');
    $texts = fn($d) => array_column($feed['days'][$d] ?? [], 'text');
    ok(in_array('water ferns', $texts($today), true), 'the rolled one sits on today');
    $rolled = array_values(array_filter($feed['days'][$today], fn($r) => $r['text'] === 'water ferns'))[0];
    ok(!empty($rolled['rolled']), 'and wears the rolled tint');
    $next = date('Y-m-d', strtotime($lastWeek . ' +14 days'));
    ok(in_array('water ferns', $texts($next), true), 'its future repeat date still lists');
    $all = [];
    foreach (($feed['days'] ?? []) as $rs) { foreach ($rs as $r) { $all[] = $r['text']; } }
    ok(!in_array('invisible', $all, true), 'a hidden folder never feeds');
    ok(count($all) <= 12, 'the suite cap of 12 rows holds');
});
t('the cals= pin narrows the feed to the calendars baked at copy time', function () use ($tokenA) {
    global $port;
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [
        ['id' => 'calA', 'type' => 'calendar', 'updated' => 8200, 'payload' => ['name' => 'Home', 'color' => '#0379f6', 'ord' => 'a']],
        ['id' => 'calB', 'type' => 'calendar', 'updated' => 8200, 'payload' => ['name' => 'Work', 'color' => '#ed0d10', 'ord' => 'b']],
        ['id' => 'evA', 'type' => 'event', 'updated' => 8200, 'payload' => ['text' => 'home thing', 'date' => date('Y-m-d'), 'time' => null, 'repeat' => null, 'calendarId' => 'calA', 'ord' => 'a']],
        ['id' => 'evB', 'type' => 'event', 'updated' => 8200, 'payload' => ['text' => 'work thing', 'date' => date('Y-m-d'), 'time' => null, 'repeat' => null, 'calendarId' => 'calB', 'ord' => 'b']],
    ]], $tokenA);
    // rotate: these specs want a usable key, not the "you already have one"
    // answer that a second plain call now (correctly) gives.
    $wt = api(['action' => 'widget_token', 'rotate' => true], $tokenA)['body']['token'];
    $texts = function (string $extra) use ($wt) {
        global $port;
        $feed = json_decode((string) @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=$wt$extra"), true);
        $out = [];
        foreach (($feed['days'] ?? []) as $rows) { foreach ($rows as $r) { $out[] = $r['text']; } }
        return $out;
    };
    $pinned = $texts('&cals=calA');
    ok(in_array('home thing', $pinned, true), 'the pinned calendar feeds');
    ok(!in_array('work thing', $pinned, true), 'the unpinned one does not');
    $all = $texts('&cals=all');
    ok(in_array('work thing', $all, true), 'cals=all follows prefs as before');
    $stale = $texts('&cals=ghost1,ghost2');
    ok(in_array('work thing', $stale, true), 'a fully-stale pin falls back to prefs');
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
t('removal on either side ends sharing instantly, both ways', function () use ($shareRec, &$tokP, &$tokQ) {
    api(['action' => 'sync', 'cursor' => 0, 'changes' => [
        $shareRec(['partners' => [], 'calendars' => [], 'folders' => [], 'notefolders' => []], 9),
    ]], $tokQ);
    eq(null, api(['action' => 'shared_pull'], $tokQ)['body']['partner'], 'quinn dropped pat');
    eq(null, api(['action' => 'shared_pull'], $tokP)['body']['partner'], 'and pat loses quinn the same instant');
    eq(403, api(['action' => 'shared_put', 'partner' => 'pat', 'record' =>
        ['id' => 'rs', 'type' => 'reminder', 'updated' => 10, 'payload' => ['text' => 'x', 'due' => null, 'time' => null, 'done' => false, 'repeat' => null, 'folderId' => 'fs', 'sectionId' => 'ss', 'indent' => 0, 'ord' => 'a']]], $tokQ)['status'], 'writes die with the handshake');
});

t('opening the widget page does NOT retire the key the widget is using', function () {
    // It used to. The two blocks in handle_widget_token contradicted each
    // other — the first returned null for "already minted; the client keeps
    // its copy", the second then deleted that token and minted a fresh one —
    // so every visit to Settings → Widget silently killed the widget on the
    // home screen. Invisible, and it reads as the widget being broken rather
    // than as something you did.
    $tok = api(['action' => 'signup', 'username' => 'widgy', 'email' => 'w@example.com', 'password' => 'widgypassword'])['body']['token'];
    $first = api(['action' => 'widget_token'], $tok)['body']['token'];
    ok($first !== '' && $first !== null, 'the first visit mints a key');

    $again = api(['action' => 'widget_token'], $tok)['body'];
    eq(true, $again['exists'] ?? false, 'a second visit says one already exists');
    eq(null, $again['token'], 'and hands out nothing — only the hash is kept, so it cannot be shown twice');

    // The feed still works on the original key, which is the whole point.
    global $port;
    $feed = @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=$first");
    ok($feed !== false, 'the key the widget already holds still feeds');

    // Rotation is available, but only when asked for by name.
    $rot = api(['action' => 'widget_token', 'rotate' => true], $tok)['body']['token'];
    ok($rot !== '' && $rot !== null && $rot !== $first, 'rotate mints a different key');
    $dead = @file_get_contents("http://127.0.0.1:$port/api/index.php?feed=1&t=$first");
    ok($dead === false, 'and the old one stops feeding, as a rotation should');
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

t("the server's day is Chicago's, not UTC", function () {
    // The feed asks the server what day it is. Left on UTC that answer turned
    // over at 7pm Chicago, so the widget spent every evening calling tomorrow
    // "today" and rolling reminders a day early with it.
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


echo "\n────────────────────────────────\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
