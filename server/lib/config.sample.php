<?php
/**
 * Copy to config.php (gitignored) and adjust. Without one, the data dir defaults
 * to server/data/ (or $CALMIND_DATA_DIR). Recovery codes land in data/mail.log
 * on every host — mail is stubbed suite-wide in lib/mail.php.
 */
return [
    // 'data_dir'  => '/home/protected/data-calmind-test',
    // 'data_key'  => '',          // empty = auto-generate .datakey in the data dir
    // 'send_mail' => true,        // RETIRED 2026-08-23 — no code reads it. Mail is
                                   // stubbed in lib/mail.php; turning it on means
                                   // uncommenting the transport there and the
                                   // mail_send() calls in app.php, not a flag.
    // 'timezone'  => 'America/Chicago',  // the server's day. Without it PHP keeps
                                   // UTC and the feed's "today" turns over at 7pm
                                   // Chicago — the widget calls tomorrow today.
];
