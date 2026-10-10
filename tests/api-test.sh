#!/usr/bin/env bash
# Tests the PHP sync API against a throw-away server. Usage: tests/api-test.sh   (needs php + curl)
set -u
cd "$(dirname "$0")/.."
PORT=8099; TOKEN=testtoken123; TMP=$(mktemp -d); fail=0
[ -f api/config.php ] && { echo "api/config.php exists - refusing to overwrite your real config"; exit 2; }
cat > api/config.php <<PHP
<?php return array('token' => '$TOKEN', 'data_dir' => '$TMP/data');
PHP
php -S 127.0.0.1:$PORT -t . >/dev/null 2>&1 & PID=$!
trap 'kill $PID 2>/dev/null; rm -f api/config.php; rm -rf "$TMP"' EXIT
sleep 1
U=http://127.0.0.1:$PORT/api/index.php
ok() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2', want '$3')"; fail=1; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
ok "no token -> 401"      "$(code -X POST "$U?a=ping")" 401
ok "bad token -> 401"     "$(code -X POST -H 'X-Jot-Token: nope' "$U?a=ping")" 401
ok "GET -> 405"           "$(code "$U?a=ping")" 405
ok "ping -> 200"          "$(code -X POST -H "X-Jot-Token: $TOKEN" "$U?a=ping")" 200
H=(-H "X-Jot-Token: $TOKEN" -H 'Content-Type: application/json')
R=$(curl -s -X POST "${H[@]}" "$U?a=sync" -d '{"notes":[{"id":"a1","title":"T","text":"hello","mode":"md","lang":"js","created":1,"updated":10},{"id":"../bad","text":"x"}],"tombs":{}}')
ok "sync stores 1 valid note" "$(echo "$R" | php -r '$j=json_decode(stream_get_contents(STDIN),true);echo count($j["notes"]);')" 1
R=$(curl -s -X POST "${H[@]}" "$U?a=sync" -d '{"notes":[{"id":"a1","text":"OLD","updated":5}]}')
ok "older edit does not win"  "$(echo "$R" | php -r '$j=json_decode(stream_get_contents(STDIN),true);echo $j["notes"][0]["text"];')" hello
R=$(curl -s -X POST "${H[@]}" "$U?a=sync" -d '{"notes":[{"id":"a1","text":"NEW","updated":50}]}')
ok "newer edit wins"          "$(echo "$R" | php -r '$j=json_decode(stream_get_contents(STDIN),true);echo $j["notes"][0]["text"];')" NEW
R=$(curl -s -X POST "${H[@]}" "$U?a=sync" -d '{"tombs":{"a1":60}}')
ok "tombstone deletes"        "$(echo "$R" | php -r '$j=json_decode(stream_get_contents(STDIN),true);echo count($j["notes"]);')" 0
R=$(curl -s -X POST "${H[@]}" "$U?a=sync" -d '{"notes":[{"id":"a1","text":"zombie","updated":55}]}')
ok "older than tombstone stays deleted" "$(echo "$R" | php -r '$j=json_decode(stream_get_contents(STDIN),true);echo count($j["notes"]);')" 0
ok "invalid json -> 400"      "$(code -X POST "${H[@]}" "$U?a=sync" -d 'nope')" 400
ok "data dir is protected"    "$([ -f "$TMP/data/.htaccess" ] && echo yes)" yes
exit $fail
