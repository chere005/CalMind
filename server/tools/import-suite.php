<?php
/**
 * Import one user's data from the OLD PHP suite into the new CalMind.
 *
 * Input: a JSON export of the suite's per-user files (reminders, notes,
 * events, calendars, calprefs, folders, habits — the shapes the suite stores,
 * name-keyed folders/sections and all). Output: new-model records pushed
 * through the real sync API, id-keyed, ords preserved from stored order.
 * Suite ids are kept wherever they exist, so re-running replaces (LWW).
 *
 *   php server/tools/import-suite.php --in=sean.json --url=https://…/api/index.php --token=…
 *   (--token: a bearer token for the DESTINATION account)
 */

date_default_timezone_set('America/Chicago');

$in = $url = $token = '';
foreach (array_slice($argv, 1) as $a) {
    if (str_starts_with($a, '--in=')) { $in = substr($a, 5); }
    if (str_starts_with($a, '--url=')) { $url = substr($a, 6); }
    if (str_starts_with($a, '--token=')) { $token = substr($a, 8); }
}
if ($in === '' || $url === '' || $token === '') {
    fwrite(STDERR, "usage: --in=export.json --url=…/api/index.php --token=…\n");
    exit(2);
}
$suite = json_decode((string) file_get_contents($in), true);
if (!is_array($suite)) { fwrite(STDERR, "bad input\n"); exit(1); }

$now = (time() + 120) * 1000;
$recs = [];
$rec = function (string $id, string $type, array $payload) use (&$recs, $now) {
    $recs[] = ['id' => $id, 'type' => $type, 'updated' => $now, 'payload' => $payload];
};

// Monotonic, equal-length ord keys — lexicographic order = stored order.
$ordN = 0;
$ord = function () use (&$ordN): string {
    $alpha = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    $n = ++$ordN;
    $s = '';
    for ($i = 0; $i < 4; $i++) { $s = $alpha[$n % 62] . $s; $n = intdiv($n, 62); }   // true base-62, 4 chars is plenty
    return $s;
};

/** The suite's note bodies are sanitized HTML; the new model stores plain text
 *  with the marker conventions the app's toolbar writes. */
function html_to_text(string $html): string
{
    if ($html === '' || strip_tags($html) === $html) { return $html; }
    $t = preg_replace('#<(b|strong)>(.*?)</\1>#si', '**$2**', $html);
    $t = preg_replace('#<(i|em)>(.*?)</\1>#si', '*$2*', $t);
    $t = preg_replace('#<li[^>]*>#si', "\n- ", $t);
    $t = preg_replace('#<blockquote[^>]*>#si', "\n> ", $t);
    $t = preg_replace('#<br\s*/?>#si', "\n", $t);
    $t = preg_replace('#</(div|p|ul|ol|blockquote|li)>#si', "\n", $t);
    $t = html_entity_decode(strip_tags($t), ENT_QUOTES | ENT_HTML5);
    return trim(preg_replace("/\n{3,}/", "\n\n", $t));
}

// ---------------------------------------------------------------- folders
// Suite folders are name-keyed; make id-keyed records and remember the maps.
$folders = is_array($suite['folders'] ?? null) ? $suite['folders'] : [];
$folderId = [];   // app → name → id
foreach (['reminders', 'notes'] as $app) {
    foreach ((array) ($folders[$app] ?? []) as $name) {
        $id = 'imf_' . substr(md5("$app|$name"), 0, 10);
        $folderId[$app][$name] = $id;
        $color = (string) ($folders['colors'][$app][$name] ?? '#4c8bf0');
        $payload = ['name' => (string) $name, 'color' => $color, 'ord' => $ord(), 'app' => $app];
        if ($app === 'reminders' && $name === 'Calendar') { $payload['rideAlong'] = true; }
        $rec($id, 'folder', $payload);
    }
}

// ---------------------------------------------------------------- sectioned lists
// Section rows become section records (suite ids kept); items map name → id.
$sectionId = [];   // app → "folder\x1Fsection" → id
$firstSection = [];   // app → folder name → id
foreach (['reminders' => 'reminders', 'notes' => 'notes'] as $app => $file) {
    foreach ((array) ($suite[$file] ?? []) as $row) {
        if (($row['type'] ?? '') !== 'section') { continue; }
        $folder = (string) ($row['folder'] ?? '');
        if (!isset($folderId[$app][$folder])) { continue; }   // section of a folder that no longer exists
        $id = (string) ($row['id'] ?? 'ims_' . substr(md5("$app|$folder|{$row['name']}"), 0, 10));
        $sectionId[$app][$folder . "\x1F" . $row['name']] = $id;
        $firstSection[$app][$folder] ??= $id;
        $rec($id, 'section', ['name' => (string) $row['name'], 'folderId' => $folderId[$app][$folder], 'ord' => $ord()]);
    }
    // A folder whose sections were all lost still needs one — mirror sections_normalize.
    foreach ((array) ($folders[$app] ?? []) as $name) {
        if (!isset($firstSection[$app][$name])) {
            $id = 'imd_' . substr(md5("$app|$name"), 0, 10);
            $firstSection[$app][$name] = $id;
            $sectionId[$app][$name . "\x1FGeneral"] = $id;
            $rec($id, 'section', ['name' => 'General', 'folderId' => $folderId[$app][$name], 'ord' => $ord()]);
        }
    }
}

$firstFolder = fn(string $app) => array_values($folderId[$app] ?? [])[0] ?? null;

foreach ((array) ($suite['reminders'] ?? []) as $row) {
    if (($row['type'] ?? '') === 'section') { continue; }
    $folder = (string) ($row['folder'] ?? '');
    $fid = $folderId['reminders'][$folder] ?? $firstFolder('reminders');
    if ($fid === null) { continue; }
    $fname = array_search($fid, $folderId['reminders'], true);
    $sid = $sectionId['reminders'][$fname . "\x1F" . ($row['section'] ?? '')] ?? $firstSection['reminders'][$fname];
    $repRaw = $row['repeat'] ?? null;
    $rep = is_array($repRaw) && in_array($repRaw['unit'] ?? '', ['day', 'week', 'month', 'year'], true)
        ? ['n' => max(1, (int) ($repRaw['n'] ?? 1)), 'unit' => $repRaw['unit']] : null;
    $rec((string) $row['id'], 'reminder', [
        'text' => (string) ($row['text'] ?? ''),
        'due' => ($row['due'] ?? null) ?: null,
        'time' => ($row['time'] ?? null) ?: null,
        'done' => !empty($row['done']),
        'repeat' => $rep,
        'folderId' => $fid,
        'sectionId' => $sid,
        'indent' => (int) ($row['indent'] ?? 0) > 0 ? 1 : 0,
        'ord' => $ord(),
    ]);
}

foreach ((array) ($suite['notes'] ?? []) as $row) {
    if (($row['type'] ?? '') === 'section') { continue; }
    $folder = (string) ($row['folder'] ?? '');
    $fid = $folderId['notes'][$folder] ?? $firstFolder('notes');
    if ($fid === null) { continue; }
    $fname = array_search($fid, $folderId['notes'], true);
    $sid = $sectionId['notes'][$fname . "\x1F" . ($row['section'] ?? '')] ?? $firstSection['notes'][$fname];
    $rec((string) $row['id'], 'note', [
        'title' => (string) ($row['title'] ?? ''),
        'body' => html_to_text((string) ($row['body'] ?? '')),
        'date' => ($row['date'] ?? null) ?: null,
        'folderId' => $fid,
        'sectionId' => $sid,
        'ord' => $ord(),
    ]);
}

// ---------------------------------------------------------------- calendars & events
foreach ((array) ($suite['calendars'] ?? []) as $c) {
    if (($c['type'] ?? '') === 'set' || empty($c['id'])) { continue; }   // set rows are long dead
    $rec((string) $c['id'], 'calendar', ['name' => (string) ($c['name'] ?? 'Calendar'), 'color' => (string) ($c['color'] ?? '#0379f6'), 'ord' => $ord()]);
}
foreach ((array) ($suite['events'] ?? []) as $e) {
    if (empty($e['id']) || empty($e['date'])) { continue; }
    $repRaw = $e['repeat'] ?? null;
    $rep = is_array($repRaw) && in_array($repRaw['unit'] ?? '', ['day', 'week', 'month', 'year'], true)
        ? ['n' => max(1, (int) ($repRaw['n'] ?? 1)), 'unit' => $repRaw['unit']] : null;
    $rec((string) $e['id'], 'event', [
        'text' => (string) ($e['text'] ?? ''),
        'date' => (string) $e['date'],
        'time' => ($e['time'] ?? null) ?: null,
        'repeat' => $rep,
        'calendarId' => (string) ($e['cal'] ?? ''),
        'ord' => $ord(),
    ]);
}

// ---------------------------------------------------------------- habits
foreach ((array) ($suite['habits'] ?? []) as $row) {
    if (($row['type'] ?? '') === 'section') {
        $rec((string) $row['id'], 'habitsection', ['name' => (string) ($row['name'] ?? ''), 'color' => (string) ($row['color'] ?? '#4357ef'), 'ord' => $ord()]);
    }
}
foreach ((array) ($suite['habits'] ?? []) as $row) {
    if (($row['type'] ?? '') === 'section' || empty($row['id'])) { continue; }
    $rec((string) $row['id'], 'habit', ['name' => (string) ($row['name'] ?? ''), 'sectionId' => (string) ($row['section'] ?? ''), 'ord' => $ord()]);
    foreach ((array) ($row['done'] ?? []) as $date => $on) {
        if ($on && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $date)) {
            $rec('t_' . $row['id'] . '_' . str_replace('-', '', (string) $date), 'tick', ['habitId' => (string) $row['id'], 'date' => (string) $date]);
        }
    }
}

// ---------------------------------------------------------------- prefs
$calprefs = (array) ($suite['calprefs'] ?? []);
$mapNames = function (array $names, string $app) use ($folderId): array {
    $out = [];
    foreach ($names as $n) { if (isset($folderId[$app][$n])) { $out[] = $folderId[$app][$n]; } }
    return $out;
};
$rec('prefs_calendar', 'pref', array_filter([
    'lastView' => ($calprefs['last_cal'] ?? 'all') ?: 'all',
    'hidden' => array_values(array_filter((array) ($calprefs['hidden_cals'] ?? []), 'is_string')),
    'defaultCalendarId' => (string) ($calprefs['default_cal'] ?? '') ?: null,
], fn($v) => $v !== null));
foreach (['reminders', 'notes'] as $app) {
    $defFolder = (string) ($folders['default'][$app] ?? '');
    $defSection = (string) ($folders['default_section'][$app] ?? '');
    $sid = $sectionId[$app][$defFolder . "\x1F" . $defSection] ?? ($firstSection[$app][$defFolder] ?? null);
    $lastName = (string) ($folders['last'][$app] ?? '');
    $rec("prefs_$app", 'pref', array_filter([
        'lastView' => $folderId[$app][$lastName] ?? 'all',
        'hidden' => $mapNames((array) ($folders['hidden'][$app] ?? []), $app),
        'defaultSectionId' => $sid,
    ], fn($v) => $v !== null));
}

// ---------------------------------------------------------------- push
echo count($recs), " records converted\n";
$push = function (array $chunk) use ($url, $token): void {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['action' => 'sync', 'cursor' => 0, 'changes' => $chunk]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer $token"],
    ]);
    $r = json_decode((string) curl_exec($ch), true);
    if (empty($r['ok'])) { fwrite(STDERR, 'push failed: ' . json_encode($r) . "\n"); exit(1); }
};
foreach (array_chunk($recs, 400) as $chunk) { $push($chunk); }
echo "pushed\n";
