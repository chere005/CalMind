<?php

/**
 * Fetching a URL the user supplied.
 *
 * Both routes into somebody else's calendar need this and nothing else is
 * decided yet: a subscribed .ics link is a GET, and CalDAV is a GET with
 * different verbs on top. So it is built once, carefully, and wired to
 * nothing until Sean says which route.
 *
 * The care is the point. A URL typed into an app becomes a request made BY
 * THE SERVER, from inside the host, which is a different thing from a request
 * made by a browser: it can reach addresses the user cannot. That is
 * server-side request forgery, and the defence is to resolve the name first
 * and refuse anything that is not a public address — on every redirect hop,
 * not just the first, because a redirect is exactly how the check gets walked
 * around.
 *
 * Also bounded in time and size. A calendar someone points at a 4GB file, or
 * at a socket that accepts and never answers, must not take the server with
 * it.
 */

const FETCH_TIMEOUT   = 15;               // seconds, whole request
const FETCH_MAX_BYTES = 4 * 1024 * 1024;  // a very large calendar is ~1MB
const FETCH_MAX_HOPS  = 4;

/** True when this address is one the server should never be asked to reach. */
function fetch_ip_is_private(string $ip): bool
{
    // Loopback, private, link-local, and anything reserved. FILTER_FLAG_NO_*
    // does the work; the explicit checks cover what it does not.
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        return true;
    }
    if ($ip === '0.0.0.0' || str_starts_with($ip, '127.') || str_starts_with($ip, '169.254.')) {
        return true;
    }
    // The cloud metadata address, which is the classic target and is NOT in
    // any private range.
    return $ip === '169.254.169.254';
}

/**
 * Resolves the host and refuses if any address it answers with is private.
 * Every address, not the first: a name that answers with one public and one
 * loopback address is a way through otherwise.
 */
function fetch_host_is_public(string $host): bool
{
    if ($host === '') {
        return false;
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return !fetch_ip_is_private($host);
    }
    $ips = array_merge(gethostbynamel($host) ?: [], []);
    if (!$ips) {
        return false;
    }
    foreach ($ips as $ip) {
        if (fetch_ip_is_private($ip)) {
            return false;
        }
    }
    return true;
}

/** @return array{ok:bool,status:int,body:string,error:string} */
function fetch_url(string $url, int $hops = 0): array
{
    $no = fn(string $why): array => ['ok' => false, 'status' => 0, 'body' => '', 'error' => $why];

    if ($hops > FETCH_MAX_HOPS) {
        return $no('too many redirects');
    }
    $u = parse_url($url);
    if (!is_array($u) || !isset($u['scheme'])) {
        return $no('that does not look like a URL');
    }
    // The SCHEME is checked before the host, so file:///etc/passwd — which
    // parses with no host at all — is refused for the reason that is actually
    // true rather than for looking malformed. http as well as https: plenty
    // of calendar feeds are still plain, and refusing those would be a
    // surprise rather than a protection. What matters is WHERE it points.
    if (!in_array(strtolower($u['scheme']), ['http', 'https'], true)) {
        return $no('only http and https');
    }
    if (!isset($u['host'])) {
        return $no('that does not look like a URL');
    }
    if (!fetch_host_is_public($u['host'])) {
        return $no('that address is not one this server will fetch');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,   // hops are followed BY HAND, re-checked
        CURLOPT_TIMEOUT        => FETCH_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_USERAGENT      => 'CalMind/1.0 (+calendar subscription)',
        CURLOPT_HEADER         => true,
        // Stop reading once it is clearly too big, rather than after.
        CURLOPT_BUFFERSIZE     => 16384,
        CURLOPT_NOPROGRESS     => false,
        CURLOPT_PROGRESSFUNCTION => fn($c, $dlTotal, $dlNow) => $dlNow > FETCH_MAX_BYTES ? 1 : 0,
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch) ?: 'the request failed';
        curl_close($ch);
        return $no($err);
    }
    $status  = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $hdrSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $headers = substr((string) $raw, 0, $hdrSize);
    $body    = substr((string) $raw, $hdrSize);

    if ($status >= 300 && $status < 400 && preg_match('/^Location:\s*(\S+)/mi', $headers, $m)) {
        $next = $m[1];
        // A relative Location is resolved against the host we already checked.
        if (!preg_match('#^https?://#i', $next)) {
            $next = $u['scheme'] . '://' . $u['host'] . (str_starts_with($next, '/') ? '' : '/') . $next;
        }
        return fetch_url($next, $hops + 1);
    }
    if (strlen($body) > FETCH_MAX_BYTES) {
        return $no('that file is too big');
    }
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => $body, 'error' => ''];
}
