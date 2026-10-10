<?php
// Copy this file to config.php and set a long random token.
// The same token goes into Jot > Settings > Server sync.
// Until a token is set the API refuses every request.
return array(
    'token'     => '',                       // e.g. output of: php -r "echo bin2hex(random_bytes(24));"
    'data_dir'  => __DIR__ . '/../data',     // must be writable by PHP; keep it out of the web root if you can
    'max_bytes' => 8 * 1024 * 1024,          // max request / store size
);
