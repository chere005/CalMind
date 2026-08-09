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
        file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX);
        @chmod($file, 0600);
    }
    return hash('sha256', trim((string) file_get_contents($file)), true);
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
    $iv  = random_bytes(16);
    $enc = openssl_encrypt(json_encode($data, JSON_UNESCAPED_SLASHES), 'aes-256-cbc', store_key($cfg), OPENSSL_RAW_DATA, $iv);
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
