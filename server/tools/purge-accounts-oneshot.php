<?php
/**
 * ONE-SHOT removal of named accounts, run as the web user.
 *
 * Sean, 2026-08-20: "clear any accounts you've created I don't need" — the
 * probes left behind while diagnosing the three-instances-one-store bug.
 *
 * There is no delete-account action in the API, deliberately: nothing in the
 * app should be able to remove an account, and adding an endpoint for a
 * one-off cleanup would leave that power lying around afterwards. So this is a
 * page, dropped into an instance's api/ directory, run once, deleted.
 *
 * It sits in api/ so it can reuse instance.php — the file the deploy writes
 * naming this instance's lib. That is what makes one script correct for all
 * three stores without a map of paths it could get wrong: whichever instance's
 * directory it is in, it purges that instance and no other.
 *
 * AUTHORIZATION IS A FILE, not a token in a URL (a token in a URL is a token
 * in the access log). /home/protected/tools/PURGE_OK must exist; only ssh can
 * create it. The flag is removed on a successful run.
 *
 * NAMES ARE AN ALLOW-LIST baked in below. Nothing is taken from the request,
 * so no caller can point this at an account — and the list is checked against
 * a refusal set first, so a typo cannot take out a real one.
 */

header('Content-Type: text/plain; charset=utf-8');

/**
 * Accounts to remove — throwaways only (Sean, 2026-08-20: "clear all
 * throwaways"). Two rounds: the probes this session left while diagnosing the
 * three-instances-one-store bug, then the older detritus from months of
 * simulator runs, live-API specs and smoke passes.
 *
 * NOT here, and never: sean and aki, the real accounts; example and buddy,
 * which server/tools/seed-example.php and the shared-account specs create and
 * read by name — deleting those turns a green suite red for a reason nobody
 * would look for on the server.
 */
const PURGE = [
    // this session's probes
    'iso1787286203', 'zz1787285983', 'chk1787287482',
    'probe178728616919062', 'probe178728617015230', 'probe178728617026125',
    'probe1787275091', 'mig11787273750', 'mig21787273753',
    // older throwaways: device runs, live specs, smoke passes
    'androidtw1787166862', 'simre', 'simfable37',
    'gaptest1', 'hdr844316', 'pillcheck17chars0',
    'livepk1786253494996', 'livewt1787163104130',
    'probe1786128157', 'probe1786165968',
    'smoke1786237192', 'smoke1786237318', 'smoke1786273609',
    'smoke1786275386', 'smoke1786409127', 'smoke1786482063', 'smokef2885e',
];

/** Never, whatever the list above says. The real accounts, and the fixtures
 *  the suites depend on. A belt against a typo in PURGE. */
const KEEP = ['sean', 'aki', 'example', 'buddy'];

$flag = '/home/protected/tools/PURGE_OK';
if (!is_file($flag)) {
    http_response_code(404);
    echo "Not found\n";
    exit;
}

$libFile = __DIR__ . '/instance.php';
if (!is_file($libFile)) {
    echo "REFUSING: no instance.php beside this script — cannot tell which store this is.\n";
    exit(1);
}
$lib = (string) require $libFile;
if (!is_file($lib . '/app.php')) {
    echo "REFUSING: {$lib}/app.php not found\n";
    exit(1);
}
require_once $lib . '/app.php';

$cfg = app_config();
$dir = rtrim((string) $cfg['data_dir'], '/');
echo "store: {$dir}\n";

$acc = store_read($cfg, accounts_file($cfg));
if (!is_array($acc) || $acc === []) {
    echo "no accounts file, or it did not decrypt — nothing done\n";
    exit(1);
}
echo "accounts before: ", count($acc), "\n";

$gone = [];
foreach (PURGE as $u) {
    if (in_array($u, KEEP, true)) { echo "  refusing to remove '{$u}' — it is on the keep list\n"; continue; }
    if (!isset($acc[$u])) { continue; }
    unset($acc[$u]);
    $gone[] = $u;
}

if ($gone === []) {
    echo "nothing to remove here\n";
} else {
    store_write($cfg, accounts_file($cfg), $acc);
    // Their records and any live tokens go with them; an account removed from
    // the index while its records sit on disk is a file nothing can ever reach
    // again, and a token nothing can revoke.
    foreach ($gone as $u) {
        foreach ([$dir . '/records-' . $u . '.json', $dir . '/.records-' . $u . '.lock'] as $f) {
            if (is_file($f)) { @unlink($f); }
        }
        tokens_revoke($cfg, $u);
    }
    echo "removed: ", implode(', ', $gone), "\n";
    echo "accounts after: ", count(store_read($cfg, accounts_file($cfg))), "\n";
}

@unlink($flag);
echo "flag cleared. Delete this page when every store is done.\n";
