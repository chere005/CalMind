<?php
/**
 * Copy to config.php (gitignored) and adjust. Without one, the data dir defaults
 * to server/data/ (or $CALMIND_DATA_DIR), and recovery codes only land in
 * data/mail.log instead of being sent.
 */
return [
    // 'data_dir'  => '/home/protected/data-calmind-test',
    // 'data_key'  => '',          // empty = auto-generate .datakey in the data dir
    // 'send_mail' => true,        // real recovery mail via PHP mail(); codes always log
];
