# Jot — Tasks

Legend: [x] done and covered by `tests/` · [~] done, but only partly verifiable here (see note)

- [x] 1. Plan + tasks docs
- [x] 2. Vendor libs (CodeMirror 5 + modes/addons, marked, DOMPurify, 4 mono fonts) with licences
- [x] 3. App shell (index.html), responsive layout, tiny toolbar
- [x] 4. Storage layer + settings persistence (per-note keys, index, tombstones)
- [x] 5. Plain textarea editor (default), autosave, restore
- [x] 6. 21 themes (UI + syntax), default = **Ember** (dark, red/orange)
- [x] 7. Notes manager (new, list, search in titles + text, pin, duplicate, delete)
- [x] 8. Markdown mode (colourised source, no preview) + toolbar helpers
- [x] 9. Code mode (24 languages, indent, bracket match, fold, symbol key row for mobile)
- [x] 10. Markdown preview (fullscreen, sanitised, highlighted fences)
- [x] 11. HTML/JS runner (fullscreen sandbox) + console (toggle, clear, filters, resize, REPL)
- [x] 12. Find / replace (case, regex, whole word), go to line, stats
- [x] 13. Import / export (.txt .md .html .json backup), drag & drop open
- [x] 14. Settings panel (theme grid, font, size, wrap, tabs, …)
- [x] 15. PHP 7.4 sync API (`api/index.php` + `api/config.php`) + client — `tests/api-test.sh`
- [x] 16. PWA: installable on Android (manifest, maskable icons, standalone), offline service worker
- [x] 16a. Icon + favicon set (svg, png 192/512, maskable, apple-touch, ico)
- [x] 16b. Update safety: network-first SW, `updateViaCache: none`, `.htaccess` no-cache, "updated – reload" toast — edited JS/CSS verified served fresh
- [~] 17. Keyboard shortcuts + mobile QA — emulated 360px touch viewport tested; the real on-screen keyboard
      (`visualViewport` resize handling) and iOS Safari could not be tested here, please try on a device
- [x] 18. Tests (`tests/api-test.sh`, `tests/browser-test.js`) + README (where `config.php` goes, deploy, update)
- [x] 19. Commit & push to `main`

## Known limits
- PHP 7.4 compatibility was kept by syntax (no 8.x features) but only run here on PHP 8.3.
- Sync sends all notes each time (fine for a notepad; not meant for gigabytes).
- The runner is sandboxed without `allow-same-origin`, so pages run there cannot use `localStorage`/cookies (by design: protects your notes).
