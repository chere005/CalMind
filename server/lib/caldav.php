<?php
/** Read-only CalDAV: discovery (PROPFIND) and calendar-query (REPORT).
 * Credentials are supplied per request; this module never persists them.
 * RFC 4791 §§5.2, 6.2 and 7.8. No write method is accepted here.
 */
require_once __DIR__ . '/fetchurl.php';

const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';

function caldav_url_parts(string $url): array
{
    $u = parse_url($url);
    if (!is_array($u) || strtolower($u['scheme'] ?? '') !== 'https' || empty($u['host'])) {
        throw new InvalidArgumentException('a CalDAV address starts with https://');
    }
    if (strlen($url) > 4096 || preg_match('/[\x00-\x20\x7f]/', $url) || isset($u['user']) || isset($u['pass']) || isset($u['fragment'])) {
        throw new InvalidArgumentException('use a CalDAV URL without embedded credentials or a fragment');
    }
    return $u;
}

function caldav_origin(string $url): string
{
    $u = caldav_url_parts($url);
    return 'https://' . strtolower($u['host']) . ':' . ($u['port'] ?? 443);
}

/** Resolve a DAV href against its response URL, keeping credentials on one origin. */
function caldav_href(string $base, string $href): string
{
    $href = trim($href);
    if ($href === '') { throw new InvalidArgumentException('the CalDAV server returned an empty address'); }
    $u = caldav_url_parts($base);
    $authority = 'https://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
    if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $href)) {
        $next = $href;
    } elseif (str_starts_with($href, '//')) {
        $next = 'https:' . $href;
    } elseif (str_starts_with($href, '?')) {
        $next = $authority . ($u['path'] ?? '/') . $href;
    } else {
        $path = str_starts_with($href, '/') ? $href : preg_replace('#[^/]*$#', '', $u['path'] ?? '/') . $href;
        // Dot segments occur in relative principal/home links on real DAV hosts.
        [$pathOnly, $query] = array_pad(explode('?', $path, 2), 2, null);
        $segments = [];
        foreach (explode('/', $pathOnly) as $segment) {
            if ($segment === '..') { array_pop($segments); }
            elseif ($segment !== '.') { $segments[] = $segment; }
        }
        $next = $authority . implode('/', $segments) . ($query === null ? '' : '?' . $query);
    }
    if (caldav_origin($next) !== caldav_origin($base)) {
        $target = explode('?', $next, 2)[0];
        throw new InvalidArgumentException('the CalDAV server points to another host; enter ' . $target . ' as your CalDAV address and try again');
    }
    return $next;
}

function caldav_credentials(array $in): array
{
    $url = trim(is_string($in['url'] ?? null) ? $in['url'] : '');
    caldav_url_parts($url);
    $username = is_string($in['username'] ?? null) ? trim($in['username']) : '';
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    if ($username === '' || $password === '') {
        throw new InvalidArgumentException('enter your CalDAV username and app password');
    }
    if (strlen($url) > 4096 || strlen($username) > 1024 || strlen($password) > 4096 || preg_match('/[\x00-\x1f\x7f:]/', $username) || str_contains($password, "\0")) {
        throw new InvalidArgumentException('the CalDAV address or credentials are invalid');
    }
    return [$url, $username, $password];
}

function caldav_resolve(string $host): array
{
    $host = trim($host, '[]');
    if (filter_var($host, FILTER_VALIDATE_IP)) { return [$host]; }
    $ips = gethostbynamel($host) ?: [];
    foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $record) {
        if (isset($record['ipv6'])) { $ips[] = $record['ipv6']; }
    }
    return array_values(array_unique($ips));
}

/** One pinned HTTPS request. The injected resolver/transport are for offline tests. */
function caldav_request(string $url, string $method, string $body, string $username, string $password, int $depth = 1, ?callable $resolve = null, ?callable $send = null, int $hops = 0): array
{
    if (!in_array($method, ['PROPFIND', 'REPORT'], true)) {
        throw new InvalidArgumentException('CalDAV imports only allow read-only requests');
    }
    $u = caldav_url_parts($url);
    if ($hops > FETCH_MAX_HOPS) { throw new RuntimeException('too many CalDAV redirects'); }
    $ips = ($resolve ?? 'caldav_resolve')($u['host']);
    if (!$ips) { throw new RuntimeException('could not resolve that CalDAV host'); }
    foreach ($ips as $ip) {
        if (!is_string($ip) || fetch_ip_is_private($ip)) {
            throw new RuntimeException('that address is not one this server will fetch');
        }
    }
    $request = ['method' => $method, 'body' => $body, 'username' => $username, 'password' => $password,
        'depth' => $depth, 'ip' => $ips[0], 'host' => $u['host'], 'port' => $u['port'] ?? 443];
    $r = ($send ?? 'caldav_curl')($url, $request);
    if (strlen((string) ($r['body'] ?? '')) > FETCH_MAX_BYTES) {
        throw new RuntimeException('that calendar is too large to read (over 4MB)');
    }
    $status = (int) ($r['status'] ?? 0);
    if (in_array($status, [301, 302, 303, 307, 308], true)) {
        $next = caldav_href($url, (string) ($r['location'] ?? ''));
        return caldav_request($next, $method, $body, $username, $password, $depth, $resolve, $send, $hops + 1);
    }
    if ($status < 200 || $status >= 300) {
        $why = match ($status) {
            401, 403 => 'the CalDAV server refused those credentials; check your username and app password',
            404 => 'there is no CalDAV calendar at that address',
            0 => 'could not reach that CalDAV server',
            default => "the CalDAV server answered $status",
        };
        throw new RuntimeException($why);
    }
    return ['body' => (string) ($r['body'] ?? ''), 'url' => $url];
}

function caldav_curl(string $url, array $request): array
{
    if (!function_exists('curl_init')) { throw new RuntimeException('CalDAV imports need the server’s cURL extension'); }
    $ch = curl_init($url);
    $host = trim($request['host'], '[]');
    $ip = str_contains($request['ip'], ':') ? '[' . $request['ip'] . ']' : $request['ip'];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => FETCH_TIMEOUT, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_USERAGENT => 'CalMind/1.0 (+read-only CalDAV)',
        CURLOPT_CUSTOMREQUEST => $request['method'], CURLOPT_POSTFIELDS => $request['body'],
        CURLOPT_HTTPHEADER => ['Content-Type: application/xml; charset=utf-8', 'Depth: ' . $request['depth']],
        CURLOPT_USERNAME => $request['username'], CURLOPT_PASSWORD => $request['password'],
        CURLOPT_HTTPAUTH => CURLAUTH_BASIC | CURLAUTH_DIGEST,
        // Pin the address already checked; a second DNS answer cannot rebind it.
        CURLOPT_RESOLVE => filter_var($host, FILTER_VALIDATE_IP) ? [] : [$host . ':' . $request['port'] . ':' . $ip],
        CURLOPT_PROXY => '', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HEADER => true, CURLOPT_BUFFERSIZE => 16384,
        CURLOPT_NOPROGRESS => false,
        CURLOPT_PROGRESSFUNCTION => fn($c, $total, $now) => $now > FETCH_MAX_BYTES ? 1 : 0,
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        $errno = curl_errno($ch);
        curl_close($ch);
        throw new RuntimeException(match ($errno) {
            42 => 'that calendar is too large to read (over 4MB)',
            28 => 'that CalDAV server took too long to answer',
            default => 'could not securely reach that CalDAV server',
        });
    }
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $size = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    preg_match('/^Location:\s*([^\r\n]+)/mi', substr($raw, 0, $size), $m);
    return ['status' => $status, 'body' => substr($raw, $size), 'location' => trim($m[1] ?? '')];
}

function caldav_xml(string $xml): DOMXPath
{
    if (strlen($xml) > FETCH_MAX_BYTES || stripos($xml, '<!DOCTYPE') !== false || stripos($xml, '<!ENTITY') !== false) {
        throw new RuntimeException('the CalDAV server returned unsafe or oversized XML');
    }
    $before = libxml_use_internal_errors(true);
    try {
        $doc = new DOMDocument();
        if (!$doc->loadXML($xml, LIBXML_NONET) || $doc->documentElement?->namespaceURI !== 'DAV:' || $doc->documentElement?->localName !== 'multistatus') {
            throw new RuntimeException('that address did not return a CalDAV response');
        }
    } finally { libxml_clear_errors(); libxml_use_internal_errors($before); }
    $xp = new DOMXPath($doc);
    $xp->registerNamespace('d', 'DAV:');
    $xp->registerNamespace('c', CALDAV_NS);
    $xp->registerNamespace('a', 'http://apple.com/ns/ical/');
    return $xp;
}

function caldav_good_props(DOMXPath $xp, DOMNode $response): array
{
    $props = [];
    foreach ($xp->query('d:propstat', $response) as $ps) {
        if (preg_match('#^HTTP/\S+ 2\d\d(?:\s|$)#', trim($xp->evaluate('string(d:status)', $ps)))) {
            foreach ($xp->query('d:prop', $ps) as $prop) { $props[] = $prop; }
        }
    }
    return $props;
}

function caldav_discovery_properties(): string
{
    return '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><d:current-user-principal/><c:calendar-home-set/><c:supported-calendar-component-set/><a:calendar-color/></d:prop></d:propfind>';
}

/** Direct collections, home URLs and principal discovery share one bounded path. */
function caldav_discover(string $url, string $username, string $password, ?callable $request = null): array
{
    $request ??= 'caldav_request';
    $pending = [$url]; $seen = []; $calendars = [];
    for ($i = 0; $i < 4 && $pending; $i++) {
        $next = array_shift($pending);
        if (isset($seen[$next])) { continue; }
        $seen[$next] = true;
        $res = $request($next, 'PROPFIND', caldav_discovery_properties(), $username, $password, 1);
        $base = $res['url'];
        // A stub or future transport cannot silently move credentials to a new origin.
        if (caldav_origin($base) !== caldav_origin($url)) { throw new RuntimeException('the CalDAV server changed hosts'); }
        $xp = caldav_xml($res['body']);
        foreach ($xp->query('/d:multistatus/d:response') as $response) {
            $href = trim($xp->evaluate('string(d:href)', $response));
            foreach (caldav_good_props($xp, $response) as $prop) {
                if ($xp->query('d:resourcetype/c:calendar', $prop)->length) {
                    $components = $xp->query('c:supported-calendar-component-set/c:comp', $prop);
                    if ($components->length && !$xp->query('c:supported-calendar-component-set/c:comp[@name="VEVENT"]', $prop)->length) { continue; }
                    $calendarUrl = caldav_href($base, $href);
                    $name = trim($xp->evaluate('string(d:displayname)', $prop));
                    $calendar = ['url' => $calendarUrl, 'name' => $name !== '' ? $name : (rawurldecode(basename(rtrim(parse_url($calendarUrl, PHP_URL_PATH) ?: '', '/'))) ?: 'CalDAV')];
                    $color = trim($xp->evaluate('string(a:calendar-color)', $prop));
                    if (preg_match('/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i', $color)) { $calendar['color'] = substr($color, 0, 7); }
                    $calendars[$calendarUrl] = $calendar;
                }
                foreach ($xp->query('c:calendar-home-set/d:href | d:current-user-principal/d:href', $prop) as $link) {
                    $target = caldav_href($base, $link->textContent);
                    if (!isset($seen[$target]) && !in_array($target, $pending, true)) { $pending[] = $target; }
                }
            }
        }
        if ($calendars) { return array_values($calendars); }
    }
    throw new RuntimeException('no readable event calendars found; try your calendar home or collection URL');
}

function caldav_fetch(string $url, string $username, string $password, ?callable $request = null): string
{
    $request ??= 'caldav_request';
    $query = '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>';
    $res = $request($url, 'REPORT', $query, $username, $password, 1);
    $xp = caldav_xml($res['body']);
    $out = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CalMind//Read-only CalDAV//EN\r\n";
    foreach ($xp->query('/d:multistatus/d:response') as $response) {
        $status = trim($xp->evaluate('string(d:status)', $response));
        if ($status !== '' && !preg_match('#^HTTP/\S+ 2\d\d(?:\s|$)#', $status)) {
            throw new RuntimeException('the CalDAV server could not read every calendar item');
        }
        $found = false;
        foreach (caldav_good_props($xp, $response) as $prop) {
            foreach ($xp->query('c:calendar-data', $prop) as $data) {
                $ics = str_replace(["\r\n", "\r"], "\n", trim($data->textContent));
                if (!preg_match('/^BEGIN:VCALENDAR\n(.*)\nEND:VCALENDAR$/si', $ics, $m)) {
                    throw new RuntimeException('the CalDAV server returned a damaged calendar');
                }
                $lines = explode("\n", $m[1]);
                $components = [];
                foreach ($lines as $line) {
                    // Folded continuation lines start with whitespace and are
                    // content, even when their text contains BEGIN or END.
                    if (str_starts_with(strtoupper($line), 'BEGIN:')) {
                        $name = strtoupper(substr($line, 6));
                        if (!preg_match('/^[A-Z0-9-]+$/', $name) || $name === 'VCALENDAR') {
                            throw new RuntimeException('the CalDAV server returned a damaged calendar');
                        }
                        $components[] = $name;
                    }
                    if ($components) { $out .= $line . "\r\n"; }
                    if (str_starts_with(strtoupper($line), 'END:')) {
                        if (array_pop($components) !== strtoupper(substr($line, 4))) {
                            throw new RuntimeException('the CalDAV server returned a damaged calendar');
                        }
                    }
                }
                if ($components) { throw new RuntimeException('the CalDAV server returned a damaged calendar'); }
                $found = true;
            }
        }
        // A partial report must not replace a complete cached calendar.
        if (!$found) { throw new RuntimeException('the CalDAV server could not read every calendar item'); }
        if (strlen($out) > FETCH_MAX_BYTES - 32) { throw new RuntimeException('that calendar is too large to read (over 4MB)'); }
    }
    return $out . "END:VCALENDAR\r\n";
}

function caldav_cache_file(array $cfg, string $user, string $url, string $username, string $password): string
{
    $key = hash_hmac('sha256', json_encode([$user, $url, $username, $password], JSON_THROW_ON_ERROR), store_key($cfg));
    return $cfg['data_dir'] . '/icscache/caldav-' . $key . '.json';
}
