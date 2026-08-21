<?php
/**
 * The e2e static server: one `php -S` serving the EXPORTED web app under the
 * production prefix (/calmind/, matching the baked baseUrl) and routing
 * its api/ calls into the real endpoint against a scratch data dir — the
 * closest thing to the live test instance that runs on a laptop.
 *
 *   CALMIND_DATA_DIR=/tmp/scratch php -S 127.0.0.1:8790 e2e/router.php
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = dirname(__DIR__);

if (preg_match('#^/calmind/api/#', $uri)) {
    require $root . '/server/public/api/index.php';
    return true;
}
if (str_starts_with($uri, '/calmind')) {
    $rel = substr($uri, strlen('/calmind'));
    if ($rel === '' || $rel === '/') { $rel = '/index.html'; }
    // The public request page is the SPA at a second path — the deployed
    // instance does the same with a RewriteRule in web.htaccess.
    if ($rel === '/request') { $rel = '/index.html'; }
    $file = $root . '/apps/app/dist' . $rel;
    if (is_file($file)) {
        $types = ['html' => 'text/html', 'js' => 'text/javascript', 'ico' => 'image/x-icon', 'png' => 'image/png', 'json' => 'application/json'];
        $ext = pathinfo($file, PATHINFO_EXTENSION);
        header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
        readfile($file);
        return true;
    }
}
http_response_code(404);
echo 'not found';
return true;
