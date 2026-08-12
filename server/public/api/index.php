<?php
/**
 * The one endpoint: POST JSON { action, ... }, bearer token where the action
 * needs a user. Suite-style action posts rather than REST paths, so the whole
 * API deploys as a single file behind any web server with no rewrite rules.
 * CORS is open — auth is the bearer token, never a cookie, so a foreign origin
 * holds nothing.
 */

// Repo layout first (local dev, tests); the NFSN test instance keeps lib outside
// the web root, suite-style — /home/protected/calmind/lib.
foreach ([dirname(__DIR__, 2) . '/lib', '/home/protected/calmind/lib'] as $__lib) {
    if (is_file($__lib . '/app.php')) {
        require_once $__lib . '/app.php';
        break;
    }
}
if (!function_exists('app_config')) {
    http_response_code(500);
    exit('lib not found');
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'POST only');
}

$cfg = app_config();
$in  = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($in)) {
    fail(400, 'JSON body required');
}

// Every handler answers through reply()/fail(), which set a status and send
// JSON. A throw from deeper down — store.php refusing a damaged file, say —
// would otherwise escape as raw PHP output with whatever status the server
// felt like, and a client that expects JSON reads that as gibberish. Turn it
// into the contract everything else uses.
try {
match ((string) ($in['action'] ?? '')) {
    'signup'          => handle_signup($cfg, $in),
    'login'           => handle_login($cfg, $in),
    'logout'          => handle_logout($cfg),
    'change_password' => handle_change_password($cfg, $in),
    'recover'         => handle_recover($cfg, $in),
    'reset'           => handle_reset($cfg, $in),
    'whoami'          => handle_whoami($cfg),
    'shared_pull'     => handle_shared_pull($cfg),
    'shared_put'      => handle_shared_put($cfg, $in),
    'sync'            => handle_sync($cfg, $in),
    'recipe_fetch'    => handle_recipe_fetch($cfg, $in),
    'passkey_register_begin'  => handle_passkey_register_begin($cfg),
    'passkey_register_finish' => handle_passkey_register_finish($cfg, $in),
    'passkey_login_begin'     => handle_passkey_login_begin($cfg),
    'passkey_login_finish'    => handle_passkey_login_finish($cfg, $in),
    'passkey_list'            => handle_passkey_list($cfg),
    'passkey_remove'          => handle_passkey_remove($cfg, $in),
    default           => fail(400, 'unknown action'),
};
} catch (Throwable $e) {
    fail(500, $e->getMessage());
}
