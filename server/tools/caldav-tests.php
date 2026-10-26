<?php
/** Offline CalDAV fixtures, also included by the full API suite. */
require_once dirname(__DIR__) . '/lib/caldav.php';
require_once dirname(__DIR__) . '/lib/store.php';
$caldavStandalone = !function_exists('t');
if ($caldavStandalone) {
    $pass = 0; $fail = 0;
    function t(string $name, callable $fn): void {
        global $pass, $fail;
        try { $fn(); $pass++; echo "  ✓ $name\n"; }
        catch (Throwable $e) { $fail++; echo "  ✗ $name: {$e->getMessage()}\n"; }
    }
    function ok($value, string $why): void { if (!$value) { throw new RuntimeException($why); } }
    function eq($want, $got, string $why = ''): void { if ($want !== $got) { throw new RuntimeException($why . ': ' . var_export($got, true)); } }
}
function caldav_refuses(callable $fn, string $message): void {
    try { $fn(); }
    catch (RuntimeException | InvalidArgumentException $e) {
        ok(str_contains($e->getMessage(), $message), 'expected ' . $message . ', got ' . $e->getMessage());
        return;
    }
    throw new RuntimeException('expected refusal: ' . $message);
}
$davFixtures = json_decode(file_get_contents(__DIR__ . '/caldav-fixtures.json'), true, 512, JSON_THROW_ON_ERROR);

t('CalDAV discovers principal, calendar home, and event collections by namespace', function () use ($davFixtures) {
    $calls = [];
    $transport = function ($url, $method, $body, $username, $password, $depth) use ($davFixtures, &$calls) {
        $calls[] = [$url, $method, $username, $password, $depth];
        ok(str_contains($body, 'calendar-home-set'), 'asks for the calendar home');
        $fixture = match ($url) {
            'https://dav.example/dav/' => 'principal',
            'https://dav.example/principals/alice/' => 'home',
            'https://dav.example/calendars/alice/' => 'calendars',
            default => throw new RuntimeException('unexpected request: ' . $url),
        };
        return ['url' => $url, 'body' => $davFixtures[$fixture]];
    };
    eq([['url' => 'https://dav.example/calendars/alice/work/', 'name' => 'Work & travel', 'color' => '#336699']],
        caldav_discover('https://dav.example/dav/', 'alice', 'app-secret', $transport));
    eq(3, count($calls), 'bounded discovery follows both references');
    foreach ($calls as $call) { eq(['PROPFIND', 'alice', 'app-secret', 1], array_slice($call, 1)); }
});

t('CalDAV accepts a direct collection and refuses an empty or task-only home', function () use ($davFixtures) {
    eq([['url' => 'https://dav.example/work/', 'name' => 'Work']], caldav_discover('https://dav.example/work/', 'alice', 'secret', fn($url) => ['url' => $url, 'body' => $davFixtures['direct']]));
    caldav_refuses(fn() => caldav_discover('https://dav.example/empty/', 'alice', 'secret', fn($url) => ['url' => $url, 'body' => $davFixtures['empty']]), 'no readable event calendars');
});

t('CalDAV REPORT returns one complete calendar, including empty calendars', function () use ($davFixtures) {
    $calls = [];
    $request = function ($url, $method, $body, $username, $password, $depth) use ($davFixtures, &$calls) {
        $calls[] = $method;
        ok(str_contains($body, 'comp-filter name="VEVENT"'), 'queries event objects');
        eq(1, $depth);
        return ['url' => $url, 'body' => $davFixtures['events']];
    };
    $ics = caldav_fetch('https://dav.example/work/', 'alice', 'secret', $request);
    eq(['REPORT'], $calls, 'no write methods');
    eq(1, substr_count($ics, 'BEGIN:VCALENDAR'));
    eq(1, substr_count($ics, 'END:VCALENDAR'));
    eq(2, substr_count($ics, 'BEGIN:VEVENT'));
    ok(str_contains($ics, 'SUMMARY:Team meeting') && str_contains($ics, 'UID:two'), 'both objects are present');
    $empty = caldav_fetch('https://dav.example/work/', 'alice', 'secret', fn($url) => ['url' => $url, 'body' => $davFixtures['empty']]);
    ok(str_contains($empty, 'BEGIN:VCALENDAR') && !str_contains($empty, 'VEVENT'), 'an empty calendar is valid');
});

t('CalDAV never accepts partial reports or hostile XML as a calendar', function () use ($davFixtures) {
    $failed = str_replace('HTTP/1.1 200 OK', 'HTTP/1.1 403 Forbidden', $davFixtures['events']);
    caldav_refuses(fn() => caldav_fetch('https://dav.example/work/', 'alice', 'secret', fn($url) => ['url' => $url, 'body' => $failed]), 'could not read every');
    caldav_refuses(fn() => caldav_fetch('https://dav.example/work/', 'alice', 'secret', fn($url) => ['url' => $url, 'body' => $davFixtures['mismatched']]), 'damaged calendar');
    caldav_refuses(fn() => caldav_xml('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><multistatus xmlns="DAV:">&x;</multistatus>'), 'unsafe');
    caldav_refuses(fn() => caldav_xml('<html>login</html>'), 'did not return a CalDAV');
    caldav_refuses(fn() => caldav_xml('<broken'), 'did not return a CalDAV');
    caldav_refuses(fn() => caldav_fetch('https://dav.example/work/', 'alice', 'secret', fn($url) => ['url' => $url, 'body' => '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/missing.ics</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response></d:multistatus>']), 'could not read every');
});

t('CalDAV REPORT preserves timezone components and timezone identifiers', function () use ($davFixtures) {
    $zone = "BEGIN:VTIMEZONE\r\nTZID:America/Chicago\r\nBEGIN:STANDARD\r\nDTSTART:19701101T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0600\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n";
    $input = str_replace('BEGIN:VEVENT', $zone . 'BEGIN:VEVENT', $davFixtures['events']);
    $input = str_replace('DTSTART:20261026T170000Z', 'DTSTART;TZID=America/Chicago:20261026T120000', $input);
    $ics = caldav_fetch('https://dav.example/work/', 'alice', 'secret', fn($url) => ['url' => $url, 'body' => $input]);
    ok(str_contains($ics, $zone), 'timezone definition survives aggregation');
    ok(str_contains($ics, 'DTSTART;TZID=America/Chicago:20261026T120000'), 'event time keeps its zone');
    eq(1, substr_count($ics, 'BEGIN:VCALENDAR'), 'only the wrapper is replaced');
});

t('CalDAV resolves relative paths but never crosses origins with credentials', function () {
    eq('https://dav.example:8443/principals/alice/', caldav_href('https://dav.example:8443/dav/root/', '../../principals/alice/'));
    eq('https://dav.example/work/', caldav_href('https://dav.example/root/', '//dav.example/work/'));
    caldav_refuses(fn() => caldav_href('https://dav.example/root/', 'https://other.example/work/'), 'another host');
    caldav_refuses(fn() => caldav_href('https://dav.example/root/', 'https://other.example/work/?token=secret'), 'enter https://other.example/work/ as your CalDAV address');
    caldav_refuses(fn() => caldav_href('https://dav.example/root/', 'http://dav.example/work/'), 'https://');
    caldav_refuses(fn() => caldav_href('https://dav.example/root/', 'https://dav.example:8443/work/'), 'another host');
    caldav_refuses(fn() => caldav_credentials(['url' => 'https://alice:secret@dav.example/work/', 'username' => 'alice', 'password' => 'secret']), 'embedded credentials');
    caldav_refuses(fn() => caldav_credentials(['url' => 'http://dav.example/work/', 'username' => 'alice', 'password' => 'secret']), 'https://');
    caldav_refuses(fn() => caldav_credentials(['url' => 'https://dav.example/work/']), 'username and app password');
});

t('CalDAV transport pins public DNS and rechecks every redirect before authentication', function () {
    $calls = [];
    $resolve = fn($host) => ['93.184.216.34'];
    $send = function ($url, $request) use (&$calls) {
        $calls[] = [$url, $request];
        return count($calls) === 1 ? ['status' => 301, 'location' => '../work/', 'body' => ''] : ['status' => 207, 'body' => '<ok/>'];
    };
    eq(['body' => '<ok/>', 'url' => 'https://dav.example/work/'], caldav_request('https://dav.example/dav/', 'PROPFIND', '<prop/>', 'alice', 'secret', 1, $resolve, $send));
    eq(2, count($calls));
    eq('93.184.216.34', $calls[1][1]['ip'], 'curl receives the already checked IP');
    eq('PROPFIND', $calls[1][1]['method']);
    $sends = 0;
    $redirect = function () use (&$sends) { $sends++; return ['status' => 302, 'location' => 'https://other.example/stolen', 'body' => '']; };
    caldav_refuses(fn() => caldav_request('https://dav.example/', 'REPORT', '', 'alice', 'secret', 1, $resolve, $redirect), 'another host');
    eq(1, $sends, 'credentials never reached another origin');
    $dnsCalls = 0;
    $rebind = function () use (&$dnsCalls) { return ++$dnsCalls === 1 ? ['93.184.216.34'] : ['127.0.0.1']; };
    caldav_refuses(fn() => caldav_request('https://dav.example/', 'PROPFIND', '', 'alice', 'secret', 1, $rebind, fn() => ['status' => 302, 'location' => '/next/', 'body' => '']), 'not one this server will fetch');
    caldav_refuses(fn() => caldav_request('https://dav.example/', 'REPORT', '', 'alice', 'secret', 1, fn() => ['93.184.216.34', '10.0.0.1'], fn() => throw new RuntimeException('must not send')), 'not one this server will fetch');
    caldav_refuses(fn() => caldav_request('https://dav.example/', 'PUT', '', 'alice', 'secret', 1, $resolve, $send), 'read-only');
});

t('CalDAV transport reports login failures, caps response size, and bounds redirects', function () {
    $resolve = fn() => ['93.184.216.34'];
    caldav_refuses(fn() => caldav_request('https://dav.example/', 'REPORT', '', 'alice', 'secret', 1, $resolve, fn() => ['status' => 401, 'body' => '']), 'credentials');
    caldav_refuses(fn() => caldav_request('https://dav.example/', 'REPORT', '', 'alice', 'secret', 1, $resolve, fn() => ['status' => 207, 'body' => str_repeat('x', FETCH_MAX_BYTES + 1)]), 'too large');
    caldav_refuses(fn() => caldav_request('https://dav.example/', 'REPORT', '', 'alice', 'secret', 1, $resolve, fn() => ['status' => 302, 'location' => '/', 'body' => '']), 'too many');
});

t('CalDAV cache is per account and credentials, with no plaintext secret in its path', function () {
    $cfg = ['data_dir' => 'not-used', 'data_key' => 'disposable-test-key'];
    $file = caldav_cache_file($cfg, 'alice', 'https://dav.example/work/', 'alice', 'app-secret');
    ok(!str_contains($file, 'app-secret') && !str_contains($file, 'alice'), 'only a keyed digest is stored in the path');
    ok($file !== caldav_cache_file($cfg, 'bob', 'https://dav.example/work/', 'alice', 'app-secret'), 'another CalMind account cannot reuse this cache');
    ok($file !== caldav_cache_file($cfg, 'alice', 'https://dav.example/work/', 'alice', 'new-password'), 'changed credentials cannot reuse an old authenticated cache');
});

if ($caldavStandalone) { echo "$pass passed, $fail failed\n"; exit($fail === 0 ? 0 : 1); }
