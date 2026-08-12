<?php
/**
 * Encrypted-at-rest JSON storage — the suite's store.php shape: AES-256-CBC under
 * an ENC1: prefix, key from config or an auto-generated .datakey in the data dir.
 * Reads accept legacy plaintext and re-encrypt on the next write. The sync payloads
 * inside are already opaque to every handler (the envelope), so this layer is
 * defence for the disk alone; the client-side E2EE milestone replaces neither.
 */

function store_key(array $cfg): string
{
    if (!empty($cfg['data_key'])) {
        return hash('sha256', (string) $cfg['data_key'], true);
    }
    $file = $cfg['data_dir'] . '/.datakey';
    if (!is_file($file)) {
        @mkdir($cfg['data_dir'], 0700, true);
        if (file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX) === false) {
            throw new RuntimeException('store: could not create the data key');
        }
        @chmod($file, 0600);
    }
    // An empty or unreadable key file used to fall through to
    // hash('sha256', '') — the hash of the empty string, which is a constant
    // anybody can compute. Proven both ways on 2026-08-12: a data dir that
    // cannot be written to, and a .datakey left empty by an interrupted
    // write. Neither threw, neither logged, and both encrypted every store
    // afterwards with a key that is effectively public.
    //
    // It costs the data as well as the secrecy: once a real key is written
    // later, everything encrypted under the empty-string one stops
    // decrypting, and store_read rightly refuses it for ever.
    //
    // Refusing here is the same trade store_read already makes a few lines
    // down — a 500 is recoverable, and this is not.
    //
    // Length is deliberately NOT checked. What is minted here is always 64
    // hex characters, but an operator may reasonably have written their own
    // key by hand, and rejecting a short one would break an install that is
    // merely unusual rather than broken. Empty is the case that is provably
    // wrong.
    $raw = trim((string) @file_get_contents($file));
    if ($raw === '') {
        throw new RuntimeException(
            'store: the data key is missing or empty — refusing to encrypt with a fixed, public key'
        );
    }
    return hash('sha256', $raw, true);
}

function store_read(array $cfg, string $file): array
{
    if (!is_file($file)) {
        return [];
    }
    $raw = (string) file_get_contents($file);
    if (str_starts_with($raw, 'ENC1:')) {
        $bin = base64_decode(substr($raw, 5), true);
        // A file that exists, announces itself as ENC1: and then will not
        // decrypt is CORRUPT, not empty. Returning [] here reads as "this
        // user has no records" — and the very next write persists that,
        // turning a damaged file into a deleted one. Refuse loudly instead:
        // a 500 is recoverable, a silent wipe is not.
        if ($bin === false || strlen($bin) <= 16) {
            throw new RuntimeException('store: ' . basename($file) . ' is unreadable (truncated?)');
        }
        $out = openssl_decrypt(substr($bin, 16), 'aes-256-cbc', store_key($cfg), OPENSSL_RAW_DATA, substr($bin, 0, 16));
        if ($out === false) {
            throw new RuntimeException('store: ' . basename($file) . ' will not decrypt (wrong key, or damaged)');
        }
        $raw = $out;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Written whole or not at all.
 *
 * This used to overwrite in place, so a process killed mid-write — a request
 * timeout, a full disk — left a half-written file. Half of an encrypted file
 * does not decrypt, and store_read used to answer [] to that, which is
 * indistinguishable from an empty account: one sync later the truncation
 * would have been saved as the truth. A temp file and a rename cannot end up
 * half-anything; rename(2) is atomic within a filesystem.
 */
function store_write(array $cfg, string $file, array $data): void
{
    @mkdir(dirname($file), 0700, true);
    // json_encode returns FALSE — it does not throw — on invalid UTF-8, on
    // nesting past 512, and on INF/NAN. Passing that straight to
    // openssl_encrypt encrypts the empty string, and the result is a file
    // that is structurally PERFECT: it announces ENC1, it base64-decodes, it
    // decrypts, and json_decode('') gives null, which store_read reads as an
    // account with no records. Proven on 2026-08-12 with a deliberately
    // invalid byte: one write, no error anywhere, and the whole store gone.
    //
    // That is precisely the "damaged file becomes a deleted one" that the
    // guard in store_read exists to refuse, arriving from the write side
    // where nothing was looking — and store_read cannot catch it, because
    // there is nothing wrong with the file.
    //
    // Not reachable through the API today, and worth being exact about why:
    // the request body goes through json_decode first, which rejects invalid
    // UTF-8 outright and refuses a nesting deep enough to matter (the request
    // wrapper is deeper than the store's, so anything that decodes re-encodes
    // — checked, 495 through 510). So this guards against the day data
    // reaches a store from somewhere that is NOT a validated request body: a
    // migration, an import, a server-side field, a future binary payload.
    //
    // Throwing here rather than writing is what saves the account: the write
    // is a temp file plus a rename, so failing before the rename leaves the
    // last good file exactly where it was.
    $json = json_encode($data, JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('store: could not encode ' . basename($file) . ' — ' . json_last_error_msg());
    }
    $iv  = random_bytes(16);
    $enc = openssl_encrypt($json, 'aes-256-cbc', store_key($cfg), OPENSSL_RAW_DATA, $iv);
    if ($enc === false) {
        throw new RuntimeException('store: could not encrypt ' . basename($file));
    }
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (file_put_contents($tmp, 'ENC1:' . base64_encode($iv . $enc)) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('store: could not write ' . basename($file));
    }
}

/** Run $fn while holding an exclusive lock, so read-modify-write can't race. */
function with_lock(array $cfg, string $name, callable $fn)
{
    @mkdir($cfg['data_dir'], 0700, true);
    $h = fopen($cfg['data_dir'] . '/.' . $name . '.lock', 'c');
    flock($h, LOCK_EX);
    try {
        return $fn();
    } finally {
        flock($h, LOCK_UN);
        fclose($h);
    }
}
