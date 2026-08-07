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
        if ($bin === false || strlen($bin) <= 16) {
            return [];
        }
        $raw = (string) openssl_decrypt(substr($bin, 16), 'aes-256-cbc', store_key($cfg), OPENSSL_RAW_DATA, substr($bin, 0, 16));
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function store_write(array $cfg, string $file, array $data): void
{
    @mkdir(dirname($file), 0700, true);
    $iv  = random_bytes(16);
    $enc = openssl_encrypt(json_encode($data, JSON_UNESCAPED_SLASHES), 'aes-256-cbc', store_key($cfg), OPENSSL_RAW_DATA, $iv);
    file_put_contents($file, 'ENC1:' . base64_encode($iv . $enc), LOCK_EX);
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
