<?php
/**
 * Jot — optional server sync. PHP 7.0+ (written for 7.4), no extensions needed.
 *
 *   POST ?a=ping                      -> {ok:true}
 *   POST ?a=sync  {notes:[], tombs:{}} -> merges (newest "updated" wins) and returns the full merged set
 *
 * Auth: header "X-Jot-Token" must equal the token in api/config.php (constant-time compare).
 * The custom header also makes cross-site requests impossible (they would need a CORS preflight, which is never approved).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function jot_out($code, $data)
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

$cfgFile = __DIR__ . '/config.php';
$cfg = is_file($cfgFile) ? include $cfgFile : array();
if (!is_array($cfg)) {
    $cfg = array();
}
$token    = isset($cfg['token']) ? (string)$cfg['token'] : '';
$dataDir  = isset($cfg['data_dir']) ? (string)$cfg['data_dir'] : __DIR__ . '/../data';
$maxBytes = isset($cfg['max_bytes']) ? (int)$cfg['max_bytes'] : 8 * 1024 * 1024;

if ($token === '') {
    jot_out(403, array('ok' => false, 'error' => 'Sync disabled: set a token in api/config.php'));
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jot_out(405, array('ok' => false, 'error' => 'POST only'));
}
$given = isset($_SERVER['HTTP_X_JOT_TOKEN']) ? (string)$_SERVER['HTTP_X_JOT_TOKEN'] : '';
if (!hash_equals($token, $given)) {
    sleep(1); // slow down guessing
    jot_out(401, array('ok' => false, 'error' => 'Bad token'));
}

$action = isset($_GET['a']) ? (string)$_GET['a'] : 'ping';
if ($action === 'ping') {
    jot_out(200, array('ok' => true, 'php' => PHP_VERSION, 'time' => round(microtime(true) * 1000)));
}
if ($action !== 'sync') {
    jot_out(400, array('ok' => false, 'error' => 'Unknown action'));
}

$raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($raw === false || strlen($raw) > $maxBytes) {
    jot_out(413, array('ok' => false, 'error' => 'Payload too large'));
}
$in = json_decode($raw, true);
if (!is_array($in)) {
    jot_out(400, array('ok' => false, 'error' => 'Invalid JSON'));
}

/** Validate / normalise one incoming note. Returns null when unusable. */
function jot_clean($n)
{
    if (!is_array($n) || !isset($n['id']) || !is_string($n['id']) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $n['id'])) {
        return null;
    }
    $mode = isset($n['mode']) ? $n['mode'] : 'plain';
    $lang = isset($n['lang']) ? (string)$n['lang'] : 'html';
    return array(
        'id'      => $n['id'],
        'title'   => isset($n['title']) ? mb_substr((string)$n['title'], 0, 200) : '',
        'text'    => isset($n['text']) ? (string)$n['text'] : '',
        'mode'    => in_array($mode, array('plain', 'md', 'code'), true) ? $mode : 'plain',
        'lang'    => preg_match('/^[a-z0-9+#-]{1,12}$/', $lang) ? $lang : 'html',
        'created' => isset($n['created']) ? (int)$n['created'] : 0,
        'updated' => isset($n['updated']) ? (int)$n['updated'] : 0,
        'pinned'  => !empty($n['pinned']),
    );
}

if (!is_dir($dataDir) && !@mkdir($dataDir, 0775, true)) {
    jot_out(500, array('ok' => false, 'error' => 'Cannot create data dir'));
}
// never web readable, even if the dir is inside the web root
if (!is_file($dataDir . '/.htaccess')) {
    @file_put_contents($dataDir . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    @file_put_contents($dataDir . '/index.html', '');
}

$lock = fopen($dataDir . '/.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    jot_out(500, array('ok' => false, 'error' => 'Cannot lock store'));
}

$file  = $dataDir . '/notes.json';
$store = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
if (!is_array($store)) {
    $store = array();
}
$notes = isset($store['notes']) && is_array($store['notes']) ? $store['notes'] : array();
$tombs = isset($store['tombs']) && is_array($store['tombs']) ? $store['tombs'] : array();

// deletions from the client
if (isset($in['tombs']) && is_array($in['tombs'])) {
    foreach ($in['tombs'] as $id => $ts) {
        $id = (string)$id;
        $ts = (int)$ts;
        if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id)) {
            continue;
        }
        if (isset($notes[$id]) && $notes[$id]['updated'] <= $ts) {
            unset($notes[$id]);
        }
        if (!isset($tombs[$id]) || $tombs[$id] < $ts) {
            $tombs[$id] = $ts;
        }
    }
}
// notes from the client: newest wins
if (isset($in['notes']) && is_array($in['notes'])) {
    foreach ($in['notes'] as $n) {
        $c = jot_clean($n);
        if ($c === null) {
            continue;
        }
        $id = $c['id'];
        if (isset($tombs[$id]) && $tombs[$id] >= $c['updated']) {
            continue;
        }
        if (!isset($notes[$id]) || $notes[$id]['updated'] < $c['updated']) {
            $notes[$id] = $c;
            unset($tombs[$id]);
        }
    }
}

$json = json_encode(array('notes' => $notes, 'tombs' => $tombs), JSON_UNESCAPED_UNICODE);
if ($json === false || strlen($json) > $maxBytes * 2) {
    flock($lock, LOCK_UN);
    jot_out(413, array('ok' => false, 'error' => 'Store would exceed max_bytes'));
}
$tmp = $file . '.tmp';
if (file_put_contents($tmp, $json) === false || !rename($tmp, $file)) {
    flock($lock, LOCK_UN);
    jot_out(500, array('ok' => false, 'error' => 'Cannot write store'));
}
flock($lock, LOCK_UN);

jot_out(200, array('ok' => true, 'notes' => array_values($notes), 'tombs' => (object)$tombs));
