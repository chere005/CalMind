<?php
/**
 * The local server for ChefMind: one `php -S` serving the EXPORTED web app
 * under /ChefMind (matching the baked baseUrl), with its api/ calls routed
 * into CalMind's real endpoint against a scratch data dir.
 *
 * TWO PREFIXES, and that is the point of the file. In production ChefMind is
 * served at /ChefMind and talks to /calmind/api/index.php — a different path
 * on the same origin — so a router that only knew one prefix would be testing
 * an arrangement the deployed app does not have.
 *
 *   CALMIND_DATA_DIR=/tmp/scratch php -S 127.0.0.1:8792 ChefMind/e2e-router.php
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = dirname(__DIR__);

if (preg_match('#^/calmind/api/#', $uri)) {
    require $root . '/server/public/api/index.php';
    return true;
}
if (str_starts_with($uri, '/ChefMind')) {
    $rel = substr($uri, strlen('/ChefMind'));
    if ($rel === '' || $rel === '/') { $rel = '/index.html'; }
    $file = $root . '/ChefMind/app/dist' . $rel;
    if (is_file($file)) {
        $types = ['html' => 'text/html', 'js' => 'text/javascript', 'ico' => 'image/x-icon',
                  'png' => 'image/png', 'json' => 'application/json', 'webmanifest' => 'application/manifest+json'];
        $ext = pathinfo($file, PATHINFO_EXTENSION);
        header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
        readfile($file);
        return true;
    }
}
http_response_code(404);
echo 'not found';
return true;
