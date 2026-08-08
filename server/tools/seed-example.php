<?php
/**
 * (Re)build the demo accounts — example / examplepassword and buddy /
 * buddypassword — through the real API, so the seeder exercises exactly what a
 * client does. Everything is written relative to today, so it never goes
 * stale: overdue reminders still open, a rider in the rideAlong folder,
 * repeats mid-stream, events across three calendars, notes with bodies, and
 * two months of habit history. Deterministic ids, so re-running replaces
 * instead of doubling (LWW: the newer stamp wins).
 *
 *   php server/tools/seed-example.php                    # local php -S on :8788
 *   php server/tools/seed-example.php --url=https://.../api/index.php
 */

// PHP CLI defaults to UTC, which rolls past midnight hours before the user's
// evening does — anchor "today" where the suite anchors it.
date_default_timezone_set('America/Chicago');

$url = 'http://127.0.0.1:8788/api/index.php';
foreach (array_slice($argv, 1) as $a) {
    if (str_starts_with($a, '--url=')) { $url = substr($a, 6); }
}

function api(string $url, array $body, string $token = ''): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $token ? ["Authorization: Bearer $token"] : []),
    ]);
    $raw = curl_exec($ch);
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) { fwrite(STDERR, "non-JSON from $url: " . substr((string) $raw, 0, 200) . "\n"); exit(1); }
    return $data;
}

function signin(string $url, string $user, string $pass): string
{
    $r = api($url, ['action' => 'login', 'username' => $user, 'password' => $pass]);
    if (empty($r['ok'])) { $r = api($url, ['action' => 'signup', 'username' => $user, 'email' => "$user@example.com", 'password' => $pass]); }
    if (empty($r['ok'])) { fwrite(STDERR, "cannot sign in $user: " . json_encode($r) . "\n"); exit(1); }
    return $r['token'];
}

$now = (time() + 120) * 1000;   // beats any earlier seed run
$d = fn(int $off) => date('Y-m-d', strtotime(($off >= 0 ? "+$off" : $off) . ' days'));
$recs = [];
$rec = function (string $id, string $type, array $payload) use (&$recs, $now) {
    $recs[] = ['id' => $id, 'type' => $type, 'updated' => $now, 'payload' => $payload];
};

// ---------------------------------------------------------------- example
// Folders (reminders app: Reminders + rideAlong Calendar; notes: General + Recipes)
$rec('exfR', 'folder', ['name' => 'Reminders', 'color' => '#4c8bf0', 'ord' => 'B', 'app' => 'reminders']);
$rec('exfC', 'folder', ['name' => 'Calendar', 'color' => '#66d695', 'ord' => 'D', 'app' => 'reminders', 'rideAlong' => true]);
$rec('exfG', 'folder', ['name' => 'General', 'color' => '#7dc2ed', 'ord' => 'B', 'app' => 'notes']);
$rec('exfRe', 'folder', ['name' => 'Recipes', 'color' => '#e9818a', 'ord' => 'D', 'app' => 'notes']);
$rec('exsT', 'section', ['name' => 'Today', 'folderId' => 'exfR', 'ord' => 'B']);
$rec('exsE', 'section', ['name' => 'Errands', 'folderId' => 'exfR', 'ord' => 'D']);
$rec('exsC', 'section', ['name' => 'General', 'folderId' => 'exfC', 'ord' => 'B']);
$rec('exsG', 'section', ['name' => 'General', 'folderId' => 'exfG', 'ord' => 'B']);
$rec('exsR', 'section', ['name' => 'General', 'folderId' => 'exfRe', 'ord' => 'B']);

// Reminders: overdue-and-open, a rolling repeat, a rider, subtasks, one done.
$rem = fn(array $p) => array_merge(['time' => null, 'done' => false, 'repeat' => null, 'indent' => 0], $p);
$rec('exr1', 'reminder', $rem(['text' => 'Call the plumber', 'due' => $d(-3), 'folderId' => 'exfR', 'sectionId' => 'exsT', 'ord' => 'B']));
$rec('exr2', 'reminder', $rem(['text' => 'Water the plants', 'due' => $d(-2), 'repeat' => ['n' => 3, 'unit' => 'day'], 'folderId' => 'exfR', 'sectionId' => 'exsT', 'ord' => 'D']));
$rec('exr3', 'reminder', $rem(['text' => 'Pick up the package', 'due' => $d(0), 'folderId' => 'exfR', 'sectionId' => 'exsT', 'ord' => 'F']));
$rec('exr4', 'reminder', $rem(['text' => 'Read that article', 'due' => null, 'folderId' => 'exfR', 'sectionId' => 'exsT', 'ord' => 'H']));
$rec('exr5', 'reminder', $rem(['text' => 'Dentist', 'due' => $d(9), 'time' => '14:00', 'folderId' => 'exfR', 'sectionId' => 'exsE', 'ord' => 'B']));
$rec('exr6', 'reminder', $rem(['text' => 'Laundry', 'due' => $d(7 - (int) date('w')), 'repeat' => ['n' => 1, 'unit' => 'week'], 'folderId' => 'exfR', 'sectionId' => 'exsE', 'ord' => 'D']));
$rec('exr7', 'reminder', $rem(['text' => 'Plan the trip', 'due' => $d(5), 'folderId' => 'exfR', 'sectionId' => 'exsE', 'ord' => 'F']));
$rec('exr8', 'reminder', $rem(['text' => 'Book the hotel', 'due' => null, 'indent' => 1, 'folderId' => 'exfR', 'sectionId' => 'exsE', 'ord' => 'G']));
$rec('exr9', 'reminder', $rem(['text' => 'Renew the insurance', 'due' => $d(-6), 'done' => true, 'folderId' => 'exfR', 'sectionId' => 'exsE', 'ord' => 'I']));
$rec('exr10', 'reminder', $rem(['text' => 'Vitamins', 'due' => null, 'folderId' => 'exfC', 'sectionId' => 'exsC', 'ord' => 'B']));

// Calendars and events: a weekly, an every-2-days, and three one-offs.
$rec('exc1', 'calendar', ['name' => 'Personal', 'color' => '#0379f6', 'ord' => 'B']);
$rec('exc2', 'calendar', ['name' => 'Work', 'color' => '#803be7', 'ord' => 'D']);
$rec('exc3', 'calendar', ['name' => 'Fitness', 'color' => '#fa6800', 'ord' => 'F']);
$monday = $d(1 - (int) date('w') - 7);   // last Monday
$rec('exe1', 'event', ['text' => 'Team standup', 'date' => $monday, 'time' => '09:30', 'repeat' => ['n' => 1, 'unit' => 'week'], 'calendarId' => 'exc2', 'ord' => 'B']);
$rec('exe2', 'event', ['text' => 'Gym', 'date' => $d(-1), 'time' => '18:00', 'repeat' => ['n' => 2, 'unit' => 'day'], 'calendarId' => 'exc3', 'ord' => 'D']);
$rec('exe3', 'event', ['text' => 'Dinner with Aki', 'date' => $d(2), 'time' => '19:00', 'repeat' => null, 'calendarId' => 'exc1', 'ord' => 'F']);
$rec('exe4', 'event', ['text' => '1:1 with the boss', 'date' => $d(1), 'time' => '15:00', 'repeat' => null, 'calendarId' => 'exc2', 'ord' => 'H']);
$rec('exe5', 'event', ['text' => 'Flight home', 'date' => $d(20), 'time' => '08:15', 'repeat' => null, 'calendarId' => 'exc1', 'ord' => 'J']);

// Notes: two loose, two recipes, one dated (it shows on the calendar).
$rec('exn1', 'note', ['title' => 'Packing list', 'body' => "- Passport\n- Chargers\n- Running shoes\n- The good coffee", 'date' => null, 'folderId' => 'exfG', 'sectionId' => 'exsG', 'ord' => 'B']);
$rec('exn2', 'note', ['title' => 'Ideas', 'body' => "A tiny app that seeds itself.\nTeach the watch to nag politely.", 'date' => null, 'folderId' => 'exfG', 'sectionId' => 'exsG', 'ord' => 'D']);
$rec('exn3', 'note', ['title' => 'Trip itinerary', 'body' => "Day 1 — arrive, walk the old town.\nDay 2 — museum, then the long dinner.", 'date' => $d(20), 'folderId' => 'exfG', 'sectionId' => 'exsG', 'ord' => 'F']);
$rec('exn4', 'note', ['title' => 'Croque Madame', 'body' => "Bechamel, ham, gruyere, egg on top.\nLow heat on the sauce or it breaks.", 'date' => null, 'folderId' => 'exfRe', 'sectionId' => 'exsR', 'ord' => 'B']);
$rec('exn5', 'note', ['title' => 'Pasta al Salmone', 'body' => "Smoked salmon, cream, a little vodka.\nFinish in the pan, always.", 'date' => null, 'folderId' => 'exfRe', 'sectionId' => 'exsR', 'ord' => 'D']);

// Habits: two sections, five habits, two months of deterministic history.
$rec('exhs1', 'habitsection', ['name' => 'Health', 'color' => '#4357ef', 'ord' => 'B']);
$rec('exhs2', 'habitsection', ['name' => 'Mind', 'color' => '#e44525', 'ord' => 'D']);
$habits = [
    ['exh1', 'Run', 'exhs1', 'B', 60], ['exh2', 'Stretch', 'exhs1', 'D', 75], ['exh3', 'Water', 'exhs1', 'F', 85],
    ['exh4', 'Read', 'exhs2', 'B', 70], ['exh5', 'Journal', 'exhs2', 'D', 55],
];
foreach ($habits as [$id, $name, $sec, $ord]) {
    $rec($id, 'habit', ['name' => $name, 'sectionId' => $sec, 'ord' => $ord]);
}
for ($i = 0; $i < 60; $i++) {
    $date = $d(-$i);
    foreach ($habits as [$id, , , , $rate]) {
        if (crc32("$id|$date") % 100 < $rate) {
            $rec('t_' . $id . '_' . str_replace('-', '', $date), 'tick', ['habitId' => $id, 'date' => $date]);
        }
    }
}

$exampleRecs = $recs;

// ---------------------------------------------------------------- buddy
// A lighter account — the future sharing partner (sharing lands later).
$recs = [];
$rec('bdfR', 'folder', ['name' => 'Reminders', 'color' => '#ea5853', 'ord' => 'B', 'app' => 'reminders']);
$rec('bdfC', 'folder', ['name' => 'Calendar', 'color' => '#66d695', 'ord' => 'D', 'app' => 'reminders', 'rideAlong' => true]);
$rec('bdfG', 'folder', ['name' => 'General', 'color' => '#7dc2ed', 'ord' => 'B', 'app' => 'notes']);
$rec('bdsA', 'section', ['name' => 'Groceries', 'folderId' => 'bdfR', 'ord' => 'B']);
$rec('bdsC', 'section', ['name' => 'General', 'folderId' => 'bdfC', 'ord' => 'B']);
$rec('bdsG', 'section', ['name' => 'General', 'folderId' => 'bdfG', 'ord' => 'B']);
$rec('bdc1', 'calendar', ['name' => 'Personal', 'color' => '#0379f6', 'ord' => 'B']);
$rem2 = fn(array $p) => array_merge(['time' => null, 'done' => false, 'repeat' => null, 'indent' => 0], $p);
$rec('bdr1', 'reminder', $rem2(['text' => 'Gruyere and ham', 'due' => $d(1), 'folderId' => 'bdfR', 'sectionId' => 'bdsA', 'ord' => 'B']));
$rec('bdr2', 'reminder', $rem2(['text' => 'Good bread', 'due' => $d(1), 'folderId' => 'bdfR', 'sectionId' => 'bdsA', 'ord' => 'D']));
$rec('bde1', 'event', ['text' => 'Dinner at example\'s', 'date' => $d(2), 'time' => '19:00', 'repeat' => null, 'calendarId' => 'bdc1', 'ord' => 'B']);
$rec('bdn1', 'note', ['title' => 'Wine to bring', 'body' => 'The riesling from last time.', 'date' => null, 'folderId' => 'bdfG', 'sectionId' => 'bdsG', 'ord' => 'B']);
$buddyRecs = $recs;

// ---------------------------------------------------------------- push
foreach ([['example', 'examplepassword', $exampleRecs], ['buddy', 'buddypassword', $buddyRecs]] as [$user, $pass, $batch]) {
    $token = signin($url, $user, $pass);
    foreach (array_chunk($batch, 400) as $chunk) {
        $r = api($url, ['action' => 'sync', 'cursor' => 0, 'changes' => $chunk], $token);
        if (empty($r['ok'])) { fwrite(STDERR, "push failed for $user\n"); exit(1); }
    }
    echo "seeded $user (" . count($batch) . " records)\n";
}
echo "done — sign in as example / examplepassword\n";
