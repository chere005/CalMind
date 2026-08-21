<?php
/**
 * Copy one CalMind account's records to another, over the sync API.
 *
 * For the test → prod move (Sean, 2026-08-20: "let me make new accounts, then
 * migrate the data over, ignoring previous passwords"). Not import-suite.php,
 * which converts the OLD PHP SUITE's per-user files; this is CalMind to
 * CalMind, where both ends already speak records and nothing needs reshaping.
 *
 *   php server/tools/copy-account.php \
 *     --from=https://…/test/calmind/api/index.php --from-token=… \
 *     --to=https://…/calmind/api/index.php       --to-token=… [--dry-run]
 *
 * Records keep their ids and their `updated` stamps, so this is idempotent:
 * running it twice changes nothing the second time, and a record edited on the
 * destination AFTER the copy wins on the next run rather than being reverted.
 * That is the opposite of import-suite's future-stamping, and deliberate —
 * there is no reason to force here.
 *
 * TOMBSTONES COME TOO. A deleted record is a record with `deleted` set, and
 * leaving them behind would resurrect everything either of you has ever thrown
 * away the moment the two stores next met.
 *
 * The destination is REPORTED, never cleared. A brand-new account arrives with
 * seeded defaults (a General folder and section), and those have ids of their
 * own, so nothing collides — but you may want to tidy them in the app
 * afterwards. Deciding that for you is not this script's business.
 */

$from = $fromTok = $to = $toTok = '';
$dry = false;
foreach (array_slice($argv, 1) as $a) {
    if (str_starts_with($a, '--from-token=')) { $fromTok = substr($a, 13); }
    elseif (str_starts_with($a, '--to-token=')) { $toTok = substr($a, 11); }
    elseif (str_starts_with($a, '--from=')) { $from = substr($a, 7); }
    elseif (str_starts_with($a, '--to=')) { $to = substr($a, 5); }
    elseif ($a === '--dry-run') { $dry = true; }
    else { fwrite(STDERR, "unknown argument: $a\n"); exit(2); }
}
if ($from === '' || $fromTok === '' || $to === '' || $toTok === '') {
    fwrite(STDERR, "usage: --from=URL --from-token=T --to=URL --to-token=T [--dry-run]\n");
    exit(2);
}
if ($from === $to) {
    fwrite(STDERR, "refusing: source and destination are the same instance\n");
    exit(1);
}

function call(string $url, array $body, string $token): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer $token"],
        CURLOPT_TIMEOUT => 60,
    ]);
    $raw = (string) curl_exec($ch);
    $out = json_decode($raw, true);
    if (!is_array($out) || empty($out['ok'])) {
        fwrite(STDERR, "call failed: " . substr($raw, 0, 300) . "\n");
        exit(1);
    }
    return $out;
}

$src = call($from, ['action' => 'sync', 'cursor' => 0, 'changes' => []], $fromTok);
$dst = call($to, ['action' => 'sync', 'cursor' => 0, 'changes' => []], $toTok);
$recs = (array) ($src['changes'] ?? []);
$have = (array) ($dst['changes'] ?? []);

$live = 0;
$dead = 0;
foreach ($recs as $r) { if (!empty($r['deleted'])) { $dead++; } else { $live++; } }
echo "source:      ", count($recs), " records ($live live, $dead tombstones)\n";
echo "destination: ", count($have), " records before\n";
if (count($have) > 0) {
    echo "  (a new account arrives with seeded defaults; their ids differ, so nothing is overwritten)\n";
}
if ($recs === []) { echo "nothing to copy\n"; exit(0); }
if ($dry) { echo "--dry-run: nothing sent\n"; exit(0); }

// MAX_BATCH is 500 server-side; 400 leaves room and matches import-suite.
$sent = 0;
foreach (array_chunk($recs, 400) as $chunk) {
    $r = call($to, ['action' => 'sync', 'cursor' => 0, 'changes' => $chunk], $toTok);
    $refused = (array) ($r['rejected'] ?? []);
    if ($refused !== []) {
        fwrite(STDERR, "server refused " . count($refused) . " record(s): " . json_encode(array_slice($refused, 0, 5)) . "\n");
        exit(1);
    }
    $sent += count($chunk);
    echo "  pushed $sent/", count($recs), "\n";
}

// Prove it landed by ASKING, rather than trusting the push's own word.
$after = call($to, ['action' => 'sync', 'cursor' => 0, 'changes' => []], $toTok);
$got = [];
foreach ((array) ($after['changes'] ?? []) as $c) { $got[(string) $c['id']] = true; }
$missing = 0;
foreach ($recs as $r) { if (!isset($got[(string) $r['id']])) { $missing++; } }
echo "destination: ", count($after['changes'] ?? []), " records after\n";
if ($missing > 0) {
    fwrite(STDERR, "$missing record(s) are not on the destination — NOT a clean copy\n");
    exit(1);
}
echo "every source record is present on the destination.\n";
