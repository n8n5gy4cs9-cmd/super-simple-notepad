# Jot

Plain text first. Opens to a big, empty, monospace page — nothing else. When you need more, switch the
mode in the bottom-left corner: **Text** → **MD** (colourised markdown) → **Code** (full syntax-highlighted editor),
and hit ▶ to preview markdown or run HTML / JavaScript fullscreen with a toggleable console.

* Saves automatically to your browser (`localStorage`) — works offline, on desktop and phones.
* Optional **PHP 7.4+** sync to your own server.
* **No Node, no build step, no CDN.** Every library is vendored in `vendor/`.
* Installable on Android (and desktop / iOS) as an app.
* 21 themes (default **Ember**: dark, red/orange). Everything you change is remembered.

---

## Run it

Jot is just static files. Pick one:

| How | Command / steps |
|-----|-----------------|
| Quick local try (PHP) | `php -S localhost:8080` in this folder, open <http://localhost:8080> |
| Any web host (Apache/nginx/shared hosting) | Upload **the whole folder** to a directory on your host, open that URL |
| Just the editor, no server | Open `index.html` directly (works; PWA install / service worker need `http(s)://`) |

> Installing as an app and the offline service worker require **HTTPS** (or `localhost`).

## Optional: server sync (PHP)

Skip this if localStorage is enough. Folder layout on your server:

```
your-site/
├── index.html
├── api/
│   ├── index.php          ← the sync endpoint (already there)
│   ├── config.sample.php  ← template
│   └── config.php         ← YOU create this (see below)
└── data/                  ← created automatically on first sync (notes.json)
```

1. Copy the template **inside the `api/` folder**:
   `cp api/config.sample.php api/config.php`
2. Open `api/config.php` and set a long random token:
   ```php
   return array(
       'token'     => 'paste-a-long-random-string-here',   // php -r "echo bin2hex(random_bytes(24));"
       'data_dir'  => __DIR__ . '/../data',                 // must be writable by PHP
       'max_bytes' => 8 * 1024 * 1024,
   );
   ```
3. Make sure PHP can write the `data/` folder (it is created next to `api/` if the parent is writable;
   otherwise create it and `chmod 775`). Better: point `data_dir` somewhere **outside** the web root.
4. In Jot: ⋯ menu → **Settings → Server sync** → paste the same token → **Test** → **Sync now**.
   Optionally tick *Sync automatically after edits*.

Security notes: until a token is set the API refuses everything (HTTP 403); the token is compared in
constant time; `api/config.php` and `data/` are git-ignored and blocked by the bundled `.htaccess`
(Apache). On **nginx** add: `location ~ ^/(data|api/config\.php) { deny all; }`.
Use HTTPS — the token travels in a request header. Sync merges by "newest edit wins" per note, deletions included.

## Install as an Android app

1. Host Jot over **HTTPS** (any static host works).
2. Open it in **Chrome for Android** → ⋮ menu → **Install app** (or *Add to Home screen*).
3. It launches fullscreen (standalone), with its own icon, and works offline.

On desktop Chrome/Edge use the install icon in the address bar. iOS: Share → Add to Home Screen.

## Updating (no stale cache)

Upload the new files over the old ones — that's it. Installed apps pick the update up automatically:

* The service worker is **network-first**: whenever you are online, every HTML/JS/CSS file is re-validated
  with the server, so edited files are never served from an old cache. The cache is only an offline fallback.
* `sw.js` is registered with `updateViaCache: 'none'` and the bundled `.htaccess` sends `Cache-Control: no-cache`
  for html/js/css/php/webmanifest and `no-store` for `sw.js`.
* When a new service worker takes over, Jot shows **“Jot was updated — Reload”**. Menu → *Check for updates* forces a check.
* Release habit: bump `VERSION` in `sw.js` (renames the offline cache so old entries are dropped).

## Using it

| | |
|---|---|
| **Text** | A bare `<textarea>`. No highlighting, no gutters. Tab inserts a tab. |
| **MD** | Colourised markdown source (headings, bold, code, links, fenced code in the right language). Small toolbar (B, I, lists, table…); **no** live preview. ▶/👁 opens a fullscreen rendered preview (sanitised). |
| **Code** | CodeMirror editor: 24 languages, line numbers, folding, bracket matching, auto-close, comment toggle (`Ctrl+/`), move line (`Alt+↑/↓`). On phones a key row gives `Tab ← → ↑ ↓ { } ( ) [ ] …`. |
| **Run** | HTML, JavaScript and SVG run in a sandboxed iframe, fullscreen. Console (tap the terminal icon) shows `console.*`, errors with line numbers, unhandled rejections and has a prompt to run JS in the page. Resize it by dragging the handle; the 📱 button previews phone/tablet widths. |
| **Notes** | ☰ opens the note list: search (titles and contents), pin, delete. |
| **Tools** | ⋯ menu: undo/redo, find & replace (case / regex / whole word), go to line, sort / unique / case / JSON format / URL & Base64 tools, statistics, open file, download, share, focus mode, backup. Files can also be dragged onto the page. |

Shortcuts: `Ctrl/⌘+S` save · `Ctrl+F` find · `F3` next · `Ctrl+Enter` run/preview · `Ctrl+K` notes · `Alt+N` new note ·
`Ctrl+Shift+M` cycle mode · `Ctrl+.` focus mode · `Ctrl+,` settings · `Esc` close.

## Layout

```
index.html  manifest.webmanifest  sw.js  favicon.ico  .htaccess
css/        app.css (UI + syntax skin)  fonts.css
js/         store.js themes.js langs.js editor.js preview.js sync.js app.js
api/        index.php (PHP 7.4)  config.sample.php   → you add config.php
vendor/     codemirror 5.65 · marked 12 · DOMPurify 3 · JetBrains Mono / IBM Plex Mono / Fira Code / Source Code Pro (OFL)
icons/      app icons (generated by tools/make-icons.py, output is committed)
tests/      api-test.sh (PHP API) · browser-test.js (dev-only Playwright e2e)
PLAN.md  TASKS.md
```

Backups: Settings → Data → **Export backup** (JSON) / **Import backup** (merges, newest edit wins).
Licences of vendored libraries are next to their files.
