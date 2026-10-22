<?php
/**
 * Black-box API contract checks. By default this starts an isolated local API;
 * --url targets another deployment and requires --allow-destructive because
 * the suite creates and deletes disposable accounts.
 *
 *   php server/tools/contract-test.php
 *   php server/tools/contract-test.php --url=https://test.example/api/index.php --allow-destructive
 */

$root = dirname(__DIR__, 2);
$url = getenv('CALMIND_CONTRACT_URL') ?: '';
$originOverride = getenv('CALMIND_CONTRACT_ORIGIN') ?: '';
$rpIdOverride = getenv('CALMIND_CONTRACT_RP_ID') ?: '';
$allowDestructive = getenv('CALMIND_CONTRACT_ALLOW_DESTRUCTIVE') === '1';
foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--allow-destructive') { $allowDestructive = true; continue; }
    if (str_starts_with($arg, '--url=')) { $url = substr($arg, 6); continue; }
    if (str_starts_with($arg, '--origin=')) { $originOverride = substr($arg, 9); continue; }
    if (str_starts_with($arg, '--rp-id=')) { $rpIdOverride = substr($arg, 8); continue; }
    if (in_array($arg, ['--url', '--origin', '--rp-id'], true)) {
        fwrite(STDERR, "Use --url=URL, --origin=ORIGIN, and --rp-id=HOST\n"); exit(2);
    }
    fwrite(STDERR, "Unknown option: $arg\n"); exit(2);
}

$scratch = null;
$server = null;
if ($url === '') {
    $scratch = sys_get_temp_dir() . '/calmind-contract-' . getmypid();
    @mkdir($scratch, 0700, true);
    $sock = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
    if ($sock === false) { fwrite(STDERR, "Could not reserve a local port: $error\n"); exit(2); }
    $port = (int) explode(':', stream_socket_get_name($sock, false))[1];
    fclose($sock);
    $server = proc_open(
        'CALMIND_DATA_DIR=' . escapeshellarg($scratch)
        . ' CALMIND_MEETREQ_USER=contract-owner'
        . ' php -d display_errors=1 -d error_reporting=E_ALL -S 127.0.0.1:' . $port
        . ' -t ' . escapeshellarg($root . '/server/public'),
        [1 => ['file', '/dev/null', 'w'], 2 => ['file', $scratch . '/server.log', 'w']],
        $pipes
    );
    if (!is_resource($server)) { fwrite(STDERR, "Could not start the local API\n"); exit(2); }
    $url = "http://127.0.0.1:$port/api/index.php";
    $ready = false;
    for ($i = 0; $i < 100; $i++) {
        $sock = @fsockopen('127.0.0.1', $port, $errno, $error, 0.2);
        if ($sock) { fclose($sock); $ready = true; break; }
        usleep(100_000);
    }
    if (!$ready) { fwrite(STDERR, "Local API did not start\n"); exit(2); }
} else {
    $parts = parse_url($url);
    if (!is_array($parts) || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host'])) {
        fwrite(STDERR, "--url must be an absolute HTTP(S) API URL\n"); exit(2);
    }
    if (isset($parts['user']) || isset($parts['pass'])) { fwrite(STDERR, "Credentials in --url are refused\n"); exit(2); }
    if (isset($parts['query']) || isset($parts['fragment'])) { fwrite(STDERR, "--url must not include a query or fragment\n"); exit(2); }
    $host = strtolower((string) $parts['host']);
    $packed = @inet_pton($host);
    $loopback = $host === 'localhost'
        || ($packed !== false && (strlen($packed) === 4 ? ord($packed[0]) === 127 : $packed === str_repeat("\0", 15) . "\1"));
    if (!$loopback && !$allowDestructive) {
        fwrite(STDERR, "Remote contract runs create and delete accounts; add --allow-destructive to confirm the target is disposable.\n");
        exit(2);
    }
    $path = rtrim((string) ($parts['path'] ?? ''), '/');
    if (str_ends_with($path, '/api/index.php') || $path === '/api/index.php') {
        // Already an endpoint URL.
    } elseif (str_ends_with($path, '/api')) {
        $path .= '/index.php';
    } else {
        $path .= '/api/index.php';
    }
    $url = $parts['scheme'] . '://' . $parts['host']
        . (isset($parts['port']) ? ':' . $parts['port'] : '') . $path;
}

$endpoint = $url;
$pass = 0;
$fail = 0;
$users = [];
$tokens = [];
$deleted = [];
$baseOrigin = (string) (parse_url($url, PHP_URL_SCHEME) . '://' . parse_url($url, PHP_URL_HOST)
    . (parse_url($url, PHP_URL_PORT) ? ':' . parse_url($url, PHP_URL_PORT) : ''));
$baseOrigin = $originOverride !== '' ? $originOverride : $baseOrigin;
$rpId = $rpIdOverride !== '' ? $rpIdOverride : strtolower((string) parse_url($url, PHP_URL_HOST));
$originParts = parse_url($baseOrigin);
if (!is_array($originParts) || !in_array($originParts['scheme'] ?? '', ['http', 'https'], true) || empty($originParts['host'])) {
    fwrite(STDERR, "--origin must be an absolute HTTP(S) origin\n"); exit(2);
}
if (isset($originParts['user']) || isset($originParts['pass']) || isset($originParts['query']) || isset($originParts['fragment'])
    || (isset($originParts['path']) && !in_array($originParts['path'], ['', '/'], true))) {
    fwrite(STDERR, "--origin must not include credentials, a path, a query, or a fragment\n"); exit(2);
}
if (!preg_match('/^[A-Za-z0-9.-]+$/', $rpId)) {
    fwrite(STDERR, "--rp-id must be a host name\n"); exit(2);
}

register_shutdown_function(function () use (&$server, $scratch) {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    if ($scratch !== null) {
        @array_map('unlink', glob($scratch . '/*') ?: []);
        @array_map('unlink', glob($scratch . '/.*') ?: []);
        @rmdir($scratch);
    }
});

function contract_request(array $body, string $token = ''): array
{
    global $endpoint;
    $header = "Content-Type: application/json\r\n";
    if ($token !== '') { $header .= "Authorization: Bearer $token\r\n"; }
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => $header,
        'content' => json_encode($body, JSON_THROW_ON_ERROR),
        'timeout' => 15, 'ignore_errors' => true, 'follow_location' => 0,
    ]]);
    $raw = @file_get_contents($endpoint, false, $ctx);
    if ($raw === false) { throw new RuntimeException('request failed'); }
    $status = 0;
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('#^HTTP/\S+ (\d{3})#', $line, $m)) { $status = (int) $m[1]; }
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) { throw new RuntimeException("non-JSON response ($status)"); }
    return ['status' => $status, 'body' => $data];
}

function contract_expect(bool $condition, string $message): void
{
    if (!$condition) { throw new RuntimeException($message); }
}

function contract_status(int $expected, array $response, string $message): void
{
    contract_expect($response['status'] === $expected, "$message (expected HTTP $expected, got {$response['status']})");
}

function contract_test(string $name, callable $run): void
{
    global $pass, $fail;
    try { $run(); $pass++; echo "  ✓ $name\n"; }
    catch (Throwable $e) { $fail++; echo "  ✗ $name — {$e->getMessage()}\n"; }
}

function contract_signup(string $username, string $password): string
{
    global $users, $tokens;
    $email = $username . '@example.invalid';
    $users[$username] = ['password' => $password, 'email' => $email];
    $r = contract_request(['action' => 'signup', 'username' => $username, 'email' => $email, 'password' => $password]);
    contract_status(200, $r, 'signup');
    $token = (string) ($r['body']['token'] ?? '');
    contract_expect(strlen($token) === 64, 'signup did not return a 64-character bearer token');
    $tokens[$username] = $token;
    return $token;
}

function contract_rec(string $id, string $type, int $updated, array $payload, bool $deleted = false): array
{
    return ['id' => $id, 'type' => $type, 'updated' => $updated, 'payload' => $payload, 'deleted' => $deleted];
}

function contract_b64u(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function contract_cleanup(): void
{
    global $users, $tokens, $deleted, $pass, $fail;
    foreach ($users as $username => $_) {
        if (!empty($deleted[$username])) { continue; }
        $token = $tokens[$username] ?? '';
        try {
            $r = $token !== '' ? contract_request(['action' => 'delete_account'], $token) : ['status' => 401];
            if ($r['status'] !== 200) {
                $login = contract_request(['action' => 'login', 'username' => $username,
                    'password' => $users[$username]['password']]);
                if ($login['status'] === 200) {
                    $r = contract_request(['action' => 'delete_account'], (string) ($login['body']['token'] ?? ''));
                }
            }
            if ($r['status'] === 200) {
                $deleted[$username] = true;
                echo "  ✓ cleanup removed disposable account\n";
            } else {
                $fail++;
                fwrite(STDERR, "  ✗ cleanup could not delete a disposable account (HTTP {$r['status']})\n");
            }
        } catch (Throwable $e) {
            $fail++;
            fwrite(STDERR, "  ✗ cleanup request failed: {$e->getMessage()}\n");
        }
    }
}

$spec = json_decode((string) file_get_contents($root . '/spec/protocol.json'), true);
if (!is_array($spec) || !isset($spec['recIdPattern'], $spec['maxBatch'])) {
    fwrite(STDERR, "Could not read the sync protocol contract\n"); exit(2);
}
$nonce = bin2hex(random_bytes(6));
$alice = 'ct' . $nonce . 'a';
$bob = 'ct' . $nonce . 'b';
$locked = 'ct' . $nonce . 'l';
$password = 'Contract-' . bin2hex(random_bytes(8));
$newPassword = 'Changed-' . bin2hex(random_bytes(8));
$ids = [
    'folder' => 'ct_' . $nonce . '_folder',
    'privateFolder' => 'ct_' . $nonce . '_private',
    'row' => 'ct_' . $nonce . '_row',
    'sharedRow' => 'ct_' . $nonce . '_shared_row',
    'privateRow' => 'ct_' . $nonce . '_private_row',
    // The share protocol reserves one stable record id, shared by each account.
    'share' => 'share',
    'space' => 'ct_' . $nonce . '_space',
    'invalid' => 'bad/type',
    'valid' => 'ct_' . $nonce . '_valid',
];
$changes = ['id' => 'ct_' . $nonce . '_batch', 'type' => 'reminder', 'updated' => 1, 'payload' => []];

$displayUrl = (string) (parse_url($endpoint, PHP_URL_SCHEME) . '://' . parse_url($endpoint, PHP_URL_HOST)
    . (parse_url($endpoint, PHP_URL_PORT) ? ':' . parse_url($endpoint, PHP_URL_PORT) : '')
    . (parse_url($endpoint, PHP_URL_PATH) ?: '/'));
echo "API contract: $displayUrl\n";
try {
    try {
        contract_signup($alice, $password);
        contract_signup($bob, $password);
        contract_signup($locked, $password);
    } catch (Throwable $e) {
        fwrite(STDERR, "Could not create disposable contract accounts: {$e->getMessage()}\n");
        contract_cleanup();
        exit(1);
    }

    contract_test('public spaces action reports the isolated ChefMind store', function () {
        $r = contract_request(['action' => 'spaces']);
        contract_status(200, $r, 'spaces');
        contract_expect(in_array('chef', $r['body']['spaces'] ?? [], true), 'spaces omits chef');
    });

    contract_test('signup, login, whoami, and authentication boundaries agree', function () use ($alice, $password) {
        global $tokens;
        contract_status(401, contract_request(['action' => 'whoami']), 'anonymous whoami');
        $login = contract_request(['action' => 'login', 'username' => $alice, 'password' => $password]);
        contract_status(200, $login, 'login');
        $tokens[$alice] = (string) ($login['body']['token'] ?? '');
        contract_expect(($login['body']['username'] ?? '') === $alice, 'login returned the wrong username');
        contract_expect((contract_request(['action' => 'whoami'], $tokens[$alice])['body']['username'] ?? '') === $alice, 'whoami returned the wrong username');
        contract_status(401, contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => []]), 'anonymous sync');
        contract_status(401, contract_request(['action' => 'login', 'username' => $alice, 'password' => 'wrong-password']), 'wrong password');
    });

    contract_test('sync round-trips records, advances cursors, and resolves equal-stamp edits', function () use ($alice, $ids) {
        global $tokens;
        $a = contract_rec($ids['row'], 'reminder', 10, ['text' => 'first']);
        $push = contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => [$a]], $tokens[$alice]);
        contract_status(200, $push, 'push');
        contract_expect(in_array($ids['row'], array_column($push['body']['changes'] ?? [], 'id'), true), 'push did not round-trip its row');
        $cursor = (int) ($push['body']['cursor'] ?? 0);
        contract_expect($cursor > 0, 'cursor did not advance');
        $echo = contract_request(['action' => 'sync', 'cursor' => $cursor, 'changes' => []], $tokens[$alice]);
        contract_expect(($echo['body']['changes'] ?? null) === [], 'pull after the cursor was not empty');
        $tie = contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => [contract_rec($ids['row'], 'reminder', 10, ['text' => 'second'])]], $tokens[$alice]);
        $rows = array_column($tie['body']['changes'] ?? [], null, 'id');
        contract_expect(($rows[$ids['row']]['payload']['text'] ?? '') === 'second', 'equal timestamp did not choose the later write');
    });

    contract_test('malformed records are named and valid records in the batch still land', function () use ($alice, $ids, $spec) {
        global $tokens;
        $badId = ['id' => '../escape', 'type' => 'reminder', 'updated' => 1, 'payload' => []];
        $badType = ['id' => 'ct_badtype', 'type' => 'bad-type', 'updated' => 1, 'payload' => []];
        $badStamp = ['id' => 'ct_badstamp', 'type' => 'reminder', 'updated' => 0, 'payload' => []];
        $good = contract_rec($ids['valid'], 'reminder', 11, ['text' => 'survives']);
        $r = contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => [$badId, $badType, $badStamp, $good]], $tokens[$alice]);
        contract_status(200, $r, 'mixed valid and malformed batch');
        contract_expect(($r['body']['rejected'] ?? null) === ['../escape', 'ct_badtype', 'ct_badstamp'], 'malformed IDs were not rejected per protocol');
        contract_expect(str_contains((string) $spec['invalidRecordResponse'], 'continue accepting'), 'protocol does not document batch continuation');
        contract_expect(in_array($ids['valid'], array_column($r['body']['changes'] ?? [], 'id'), true), 'valid record after malformed rows was lost');
    });

    contract_test('batch limit rejects the whole oversized request', function () use ($alice, $spec, $changes) {
        global $tokens;
        $batch = [];
        for ($i = 0; $i <= (int) $spec['maxBatch']; $i++) {
            $row = $changes; $row['id'] .= '_' . $i; $batch[] = $row;
        }
        contract_status(400, contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => $batch], $tokens[$alice]), 'oversized batch');
    });

    contract_test('spaces share login but keep independent record cursors and stores', function () use ($alice, $ids) {
        global $tokens;
        $row = contract_rec($ids['space'], 'reminder', 20, ['text' => 'chef-only']);
        contract_status(200, contract_request(['action' => 'sync', 'space' => 'chef', 'cursor' => 0, 'changes' => [$row]], $tokens[$alice]), 'ChefMind sync');
        $cal = contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokens[$alice]);
        $chef = contract_request(['action' => 'sync', 'space' => 'chef', 'cursor' => 0, 'changes' => []], $tokens[$alice]);
        contract_expect(!in_array($ids['space'], array_column($cal['body']['changes'] ?? [], 'id'), true), 'ChefMind row leaked into CalMind');
        contract_expect(in_array($ids['space'], array_column($chef['body']['changes'] ?? [], 'id'), true), 'ChefMind row was not returned from its space');
        contract_status(400, contract_request(['action' => 'sync', 'space' => '../escape', 'cursor' => 0, 'changes' => []], $tokens[$alice]), 'unknown space');
    });

    contract_test('mutual sharing exposes only selected records and allows scoped writes', function () use ($alice, $bob, $ids) {
        global $tokens;
        $share = static fn(array $partners, array $folders) => contract_rec($ids['share'], 'share', 10, [
            'partners' => $partners, 'calendars' => [], 'folders' => $folders, 'notefolders' => [],
        ]);
        $folderPayload = ['name' => 'Shared', 'color' => '#4c8bf0', 'ord' => 'a', 'app' => 'reminders'];
        $privateFolderPayload = ['name' => 'Private', 'color' => '#ea5853', 'ord' => 'b', 'app' => 'reminders'];
        $rowPayload = ['text' => 'shared', 'due' => null, 'time' => null, 'done' => false, 'repeat' => null,
            'folderId' => $ids['folder'], 'sectionId' => 'ct_section', 'indent' => 0, 'ord' => 'a'];
        $privatePayload = $rowPayload; $privatePayload['folderId'] = $ids['privateFolder'];
        $rows = [
            contract_rec($ids['folder'], 'folder', 1, $folderPayload),
            contract_rec($ids['privateFolder'], 'folder', 1, $privateFolderPayload),
            contract_rec($ids['sharedRow'], 'reminder', 1, $rowPayload),
            contract_rec($ids['privateRow'], 'reminder', 1, $privatePayload),
            $share([$bob], [$ids['folder']]),
        ];
        contract_status(200, contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => $rows], $tokens[$alice]), 'owner share setup');
        $pending = contract_request(['action' => 'shared_pull'], $tokens[$bob]);
        contract_expect(($pending['body']['partner'] ?? null) === null, 'one-sided naming opened a share');
        contract_status(200, contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => [$share([$alice], [])]], $tokens[$bob]), 'partner handshake');
        $pull = contract_request(['action' => 'shared_pull'], $tokens[$bob]);
        contract_expect(($pull['body']['partner'] ?? '') === $alice, 'mutual partner was not reported');
        $sharedIds = array_column($pull['body']['records'] ?? [], 'id'); sort($sharedIds);
        $expected = [$ids['folder'], $ids['sharedRow']]; sort($expected);
        contract_expect($sharedIds === $expected, 'private records leaked or shared records were missing');
        $rowPayload['done'] = true;
        contract_status(200, contract_request(['action' => 'shared_put', 'partner' => $alice,
            'record' => contract_rec($ids['sharedRow'], 'reminder', 2, $rowPayload)], $tokens[$bob]), 'scoped shared write');
        $state = contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokens[$alice]);
        $byId = array_column($state['body']['changes'] ?? [], null, 'id');
        contract_expect(($byId[$ids['sharedRow']]['payload']['done'] ?? false) === true, "shared write did not land in the owner's store");
        contract_status(403, contract_request(['action' => 'shared_put', 'partner' => $alice,
            'record' => contract_rec($ids['privateRow'], 'reminder', 3, $privatePayload)], $tokens[$bob]), 'private row write');
    });

    contract_test('passkey actions expose a challenge and refuse invalid ceremonies', function () use ($alice, $baseOrigin, $rpId) {
        global $tokens;
        $begin = contract_request(['action' => 'passkey_register_begin'], $tokens[$alice]);
        contract_status(200, $begin, 'passkey_register_begin');
        contract_expect(($begin['body']['rp']['id'] ?? '') === $rpId, 'registration RP ID differs from the configured contract');
        $challenge = (string) ($begin['body']['challenge'] ?? '');
        contract_expect($challenge !== '', 'registration challenge missing');
        $client = contract_b64u(json_encode(['type' => 'webauthn.create', 'challenge' => $challenge, 'origin' => $baseOrigin], JSON_THROW_ON_ERROR));
        $bad = contract_request(['action' => 'passkey_register_finish', 'clientDataJSON' => $client, 'attestationObject' => ''], $tokens[$alice]);
        contract_status(400, $bad, 'invalid registration ceremony');
        $list = contract_request(['action' => 'passkey_list'], $tokens[$alice]);
        contract_status(200, $list, 'passkey_list');
        contract_expect(is_array($list['body']['passkeys'] ?? null), 'passkey_list omitted its array');
        contract_status(404, contract_request(['action' => 'passkey_remove', 'id' => 'unknown-contract-key'], $tokens[$alice]), 'unknown passkey removal');
        $login = contract_request(['action' => 'passkey_login_begin']);
        contract_status(200, $login, 'passkey_login_begin');
        contract_expect(($login['body']['rpId'] ?? '') === $rpId, 'login RP ID differs from the configured contract');
        $clientLogin = contract_b64u(json_encode(['type' => 'webauthn.get', 'challenge' => $login['body']['challenge'] ?? '', 'origin' => $baseOrigin], JSON_THROW_ON_ERROR));
        contract_status(401, contract_request(['action' => 'passkey_login_finish', 'id' => 'unknown-contract-key', 'clientDataJSON' => $clientLogin]), 'unrecognised passkey');
    });

    contract_test('recipe and calendar fetch actions require auth and reject private addresses', function () use ($alice) {
        global $tokens;
        contract_status(401, contract_request(['action' => 'recipe_fetch', 'url' => 'http://127.0.0.1/']), 'anonymous recipe fetch');
        contract_status(401, contract_request(['action' => 'calsub_fetch', 'url' => 'http://127.0.0.1/feed.ics']), 'anonymous calendar fetch');
        contract_status(400, contract_request(['action' => 'recipe_fetch', 'url' => 'http://127.0.0.1/'], $tokens[$alice]), 'private recipe URL');
        contract_status(400, contract_request(['action' => 'calsub_fetch', 'url' => 'webcal://127.0.0.1/feed.ics'], $tokens[$alice]), 'private calendar URL');
    });

    contract_test('meeting-request read/write actions preserve their public and authenticated boundaries', function () use ($alice, $bob) {
        global $tokens;
        $date = date('Y-m-d', strtotime('next monday'));
        $slots = contract_request(['action' => 'meetreq_slots', 'user' => $alice, 'from' => $date, 'days' => 1]);
        contract_status(200, $slots, 'public slots');
        contract_expect(isset($slots['body']['days'][$date]), 'slot response omitted requested date');
        contract_status(401, contract_request(['action' => 'meetreq_day', 'date' => $date]), 'anonymous owner day');
        $day = contract_request(['action' => 'meetreq_day', 'date' => $date], $tokens[$alice]);
        contract_status(200, $day, 'owner day');
        contract_expect(($day['body']['owner'] ?? null) === false, 'non-owner received the owner editor');
        contract_status(400, contract_request(['action' => 'meetreq_mail', 'to' => 'bad', 'kind' => 'accepted'], $tokens[$alice]), 'invalid meeting mail');
        contract_status(200, contract_request(['action' => 'meetreq_mail', 'to' => 'nobody@example.invalid', 'kind' => 'declined'], $tokens[$alice]), 'meeting mail action');
        contract_status(400, contract_request(['action' => 'meetreq_create', 'user' => $alice, 'name' => '', 'email' => 'bad', 'date' => $date, 'time' => '10:00']), 'invalid meeting request');
        contract_status(200, contract_request(['action' => 'meetreq_create', 'user' => $alice, 'name' => 'Contract Test', 'email' => 'nobody@example.invalid', 'date' => $date, 'time' => '10:00']), 'valid meeting request');
        $records = contract_request(['action' => 'sync', 'cursor' => 0, 'changes' => []], $tokens[$alice]);
        contract_expect(in_array('meetreq', array_column($records['body']['changes'] ?? [], 'type'), true), 'meeting request was not stored for sync');
        contract_expect(($tokens[$bob] ?? '') !== '', 'second account token missing');
    });

    contract_test('password change and logout invalidate old bearer tokens', function () use ($alice, $bob, $newPassword) {
        global $tokens, $users;
        $oldAlice = $tokens[$alice];
        $oldPassword = $users[$alice]['password'];
        $changed = contract_request(['action' => 'change_password', 'old' => $oldPassword, 'new' => $newPassword], $oldAlice);
        contract_status(200, $changed, 'change_password');
        $tokens[$alice] = (string) ($changed['body']['token'] ?? '');
        contract_expect(strlen($tokens[$alice]) === 64, 'password change did not return a bearer token');
        contract_status(401, contract_request(['action' => 'whoami'], $oldAlice), 'old token after password change');
        contract_status(401, contract_request(['action' => 'login', 'username' => $alice, 'password' => $oldPassword]), 'old password');
        contract_status(200, contract_request(['action' => 'login', 'username' => $alice, 'password' => $newPassword]), 'new password');
        $users[$alice]['password'] = $newPassword;
        $oldBob = $tokens[$bob];
        contract_status(200, contract_request(['action' => 'logout'], $oldBob), 'logout');
        contract_status(401, contract_request(['action' => 'whoami'], $oldBob), 'logged-out token');
        $login = contract_request(['action' => 'login', 'username' => $bob, 'password' => $users[$bob]['password']]);
        contract_status(200, $login, 're-login for cleanup');
        $tokens[$bob] = (string) ($login['body']['token'] ?? '');
    });

    contract_test('recovery is non-enumerating, reset rejects a wrong code, and lockout throttles guesses', function () use ($alice, $locked, $password) {
        global $tokens, $users;
        contract_status(200, contract_request(['action' => 'recover', 'username' => $alice]), 'recover');
        contract_status(200, contract_request(['action' => 'recover', 'username' => 'ctmissing']), 'unknown-user recover');
        contract_status(403, contract_request(['action' => 'reset', 'username' => $alice, 'code' => 'not-a-code', 'password' => 'New-pass-123']), 'wrong recovery code');
        for ($i = 0; $i < 5; $i++) {
            contract_status(401, contract_request(['action' => 'login', 'username' => $locked, 'password' => 'wrong-password']), 'wrong password attempt');
        }
        contract_status(429, contract_request(['action' => 'login', 'username' => $locked, 'password' => $password]), 'correct password during lockout');
        contract_expect(($users[$locked]['password'] ?? '') === $password && isset($tokens[$locked]), 'lockout test lost its disposable account handle');
    });

    contract_test('account deletion removes the account and invalidates its sessions', function () use ($alice, $bob) {
        global $tokens, $deleted;
        $token = $tokens[$alice];
        contract_status(200, contract_request(['action' => 'delete_account'], $token), 'delete_account');
        $deleted[$alice] = true;
        contract_status(401, contract_request(['action' => 'whoami'], $token), 'deleted-account token');
        contract_status(401, contract_request(['action' => 'login', 'username' => $alice, 'password' => 'Contract-invalid']), 'deleted account login');
        $pull = contract_request(['action' => 'shared_pull'], $tokens[$bob]);
        contract_expect(!in_array($alice, array_column($pull['body']['partners'] ?? [], 'name'), true), 'deleted username remains in partner list');
    });
} finally {
    contract_cleanup();
}

echo "\n$pass passed, $fail failed\n";
exit($fail > 0 ? 1 : 0);
