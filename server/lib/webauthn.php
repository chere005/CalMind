<?php

/**
 * Passkeys, by hand.
 *
 * WebAuthn verification is not much code once attestation is off the table:
 * we ask for `attestation: none`, so registration is "read the public key out
 * of the authenticator data", and login is "check a signature with it". What
 * remains is enough CBOR to walk a COSE key, and enough DER to hand that key
 * to openssl.
 *
 * The RP id and origin are derived from the request rather than configured.
 * That is deliberate: a wrong RP id is invisible until every passkey on every
 * device stops working at once, and asking Sean to edit a config file on the
 * host to match the domain it is already being served from is a step that can
 * only be got wrong. Config may still override both, for a host that fronts
 * the app under a different name.
 */

const WEBAUTHN_CHALLENGE_TTL = 300;      // five minutes to finish a ceremony
/**
 * A hard ceiling on stored challenges. Pruning by age alone bounds the file by
 * TRAFFIC, and passkey_login_begin is deliberately answerable without a token
 * — so anyone could make every other request on the server read and rewrite a
 * file of whatever size they liked. Normal use needs a handful. Under a burst
 * the oldest are evicted and someone mid-ceremony retries, which is a far
 * better failure than the whole API slowing to a crawl.
 */
const WEBAUTHN_MAX_CHALLENGES = 200;
const COSE_ES256 = -7;
const COSE_RS256 = -257;

function b64u_encode(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function b64u_decode(string $s): string
{
    $t = strtr($s, '-_', '+/');
    $pad = strlen($t) % 4;
    if ($pad !== 0) {
        $t .= str_repeat('=', 4 - $pad);
    }
    $out = base64_decode($t, true);
    return $out === false ? '' : $out;
}

/**
 * The subset of CBOR that WebAuthn actually emits: ints, byte and text
 * strings, arrays, maps, and the three simple values. Floats and tags are not
 * reachable from an attestation object with attestation off, and guessing at
 * them would be worse than refusing.
 */
function cbor_decode(string $bin, int &$off = 0): mixed
{
    if ($off >= strlen($bin)) {
        throw new RuntimeException('cbor: ran off the end');
    }
    $ib    = ord($bin[$off++]);
    $major = $ib >> 5;
    $info  = $ib & 0x1f;

    $readUint = function (int $info) use ($bin, &$off): int {
        if ($info < 24) {
            return $info;
        }
        $len = match ($info) {
            24 => 1, 25 => 2, 26 => 4, 27 => 8,
            default => throw new RuntimeException('cbor: bad length'),
        };
        if ($off + $len > strlen($bin)) {
            throw new RuntimeException('cbor: ran off the end');
        }
        $n = 0;
        for ($i = 0; $i < $len; $i++) {
            $n = ($n << 8) | ord($bin[$off + $i]);
        }
        $off += $len;
        return $n;
    };

    switch ($major) {
        case 0: return $readUint($info);
        case 1: return -1 - $readUint($info);
        case 2:
        case 3:
            $len = $readUint($info);
            if ($off + $len > strlen($bin)) {
                throw new RuntimeException('cbor: ran off the end');
            }
            $s = substr($bin, $off, $len);
            $off += $len;
            return $s;
        case 4:
            $len = $readUint($info);
            $a = [];
            for ($i = 0; $i < $len; $i++) {
                $a[] = cbor_decode($bin, $off);
            }
            return $a;
        case 5:
            $len = $readUint($info);
            $m = [];
            for ($i = 0; $i < $len; $i++) {
                $k = cbor_decode($bin, $off);
                $m[is_int($k) ? $k : (string) $k] = cbor_decode($bin, $off);
            }
            return $m;
        case 7:
            return match ($info) {
                20 => false, 21 => true, 22 => null,
                default => throw new RuntimeException('cbor: unsupported simple value'),
            };
        default:
            throw new RuntimeException('cbor: unsupported major type');
    }
}

// ---------------------------------------------------------------- DER, just enough

function der(int $tag, string $content): string
{
    $len = strlen($content);
    if ($len < 0x80) {
        $l = chr($len);
    } else {
        $b = ltrim(pack('N', $len), "\0");
        $l = chr(0x80 | strlen($b)) . $b;
    }
    return chr($tag) . $l . $content;
}

/** DER INTEGER: unsigned, so a leading high bit needs a zero byte in front. */
function der_uint(string $raw): string
{
    $raw = ltrim($raw, "\0");
    if ($raw === '') {
        $raw = "\0";
    }
    if (ord($raw[0]) & 0x80) {
        $raw = "\0" . $raw;
    }
    return der(0x02, $raw);
}

function der_seq(string ...$parts): string { return der(0x30, implode('', $parts)); }
function der_bitstring(string $raw): string { return der(0x03, "\0" . $raw); }
function der_oid(string $hex): string { return der(0x06, hex2bin($hex)); }

function pem(string $der): string
{
    return "-----BEGIN PUBLIC KEY-----\n"
        . chunk_split(base64_encode($der), 64, "\n")
        . "-----END PUBLIC KEY-----\n";
}

/**
 * A COSE key as openssl wants it. ES256 is what every Apple and Android
 * platform authenticator produces; RS256 is here because Windows Hello has
 * been known to, and a Windows user hitting a silent 'unsupported' would look
 * exactly like a broken login.
 */
function cose_to_pem(array $cose): string
{
    $kty = $cose[1] ?? 0;
    $alg = $cose[3] ?? 0;

    if ($kty === 2 && $alg === COSE_ES256) {
        $x = $cose[-2] ?? '';
        $y = $cose[-3] ?? '';
        if (strlen($x) !== 32 || strlen($y) !== 32) {
            throw new RuntimeException('cose: bad P-256 point');
        }
        return pem(der_seq(
            der_seq(der_oid('2a8648ce3d0201'), der_oid('2a8648ce3d030107')),
            der_bitstring("\x04" . $x . $y),
        ));
    }

    if ($kty === 3 && $alg === COSE_RS256) {
        $n = $cose[-1] ?? '';
        $e = $cose[-2] ?? '';
        if ($n === '' || $e === '') {
            throw new RuntimeException('cose: bad RSA key');
        }
        return pem(der_seq(
            der_seq(der_oid('2a864886f70d010101'), der(0x05, '')),
            der_bitstring(der_seq(der_uint($n), der_uint($e))),
        ));
    }

    throw new RuntimeException('cose: unsupported key type');
}

// ---------------------------------------------------------------- authenticator data

/**
 * rpIdHash | flags | signCount | [aaguid | credId | COSE key] | [extensions]
 */
function authdata_parse(string $auth): array
{
    if (strlen($auth) < 37) {
        throw new RuntimeException('authData: too short');
    }
    $out = [
        'rpIdHash'  => substr($auth, 0, 32),
        'flags'     => ord($auth[32]),
        'signCount' => unpack('N', substr($auth, 33, 4))[1],
        'credId'    => '',
        'cose'      => null,
    ];
    if (($out['flags'] & 0x40) === 0) {
        return $out;                      // no attested credential data
    }
    if (strlen($auth) < 55) {
        throw new RuntimeException('authData: truncated credential');
    }
    $len = unpack('n', substr($auth, 53, 2))[1];
    if (strlen($auth) < 55 + $len) {
        throw new RuntimeException('authData: truncated credential id');
    }
    $out['credId'] = substr($auth, 55, $len);
    $off = 55 + $len;
    $key = cbor_decode($auth, $off);
    if (!is_array($key)) {
        throw new RuntimeException('authData: credential key is not a map');
    }
    $out['cose'] = $key;
    return $out;
}

// ---------------------------------------------------------------- relying party

function webauthn_rp_id(array $cfg): string
{
    if (($cfg['rp_id'] ?? '') !== '') {
        return (string) $cfg['rp_id'];
    }
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    return strtolower(explode(':', $host)[0]);
}

/**
 * The origin the browser will claim. Derived, like the RP id — but the port
 * is kept, because `php -S 127.0.0.1:8080` is a different origin from
 * 127.0.0.1 and the test run is the one place that matters.
 */
function webauthn_origin(array $cfg): string
{
    if (($cfg['origin'] ?? '') !== '') {
        return (string) $cfg['origin'];
    }
    $host   = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $https  = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off';
    $scheme = $https ? 'https' : 'http';
    return $scheme . '://' . $host;
}

/**
 * localhost is a secure context for WebAuthn even over http, and it is where
 * the test run lives. Everything else must be https, or the ceremony the
 * browser ran was not the one we think we are checking.
 */
function webauthn_origin_ok(string $claimed, string $expected): bool
{
    if (hash_equals($expected, $claimed)) {
        return true;
    }
    $c = parse_url($claimed);
    $e = parse_url($expected);
    if (!is_array($c) || !is_array($e)) {
        return false;
    }
    $localhost = fn(?string $h) => $h === 'localhost' || $h === '127.0.0.1';
    return $localhost($c['host'] ?? null)
        && $localhost($e['host'] ?? null)
        && ($c['port'] ?? null) === ($e['port'] ?? null);
}
