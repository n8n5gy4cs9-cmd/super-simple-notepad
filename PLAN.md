# Super Simple Notepad — Plan

## Goal
A notepad that opens instantly into a huge, unformatted, monospace plain-text page,
and grows (on demand) into a full text / markdown / code editor with an HTML runner.
Works fully offline, 100% on mobile and desktop. No Node at runtime or build time;
server side is optional PHP (<= 7.4 compatible).

## Principles
1. **Text is the product.** Chrome is tiny (one slim bar, icon buttons); everything else is hidden until asked for.
2. **Local first.** `localStorage` is the source of truth. PHP save is an optional extra (sync/backup).
3. **Vendored.** All third-party libs live in `vendor/` and are loaded locally. No CDN.
4. **No build step.** Plain ES5/ES2015 script files, loaded with `<script>`; works from `file://` too.
5. **Mobile first.** `100dvh` layout, 44px touch targets, safe-area insets, no zoom-on-focus (16px inputs), virtual-keyboard aware.

## Architecture
```
index.html          app shell
css/app.css         layout + UI, all colours via CSS variables
css/themes.css      20 themes (CSS variable sets, [data-theme=...])
js/store.js         storage layer (localStorage, versioned, safe)
js/themes.js        theme list + CM theme mapping
js/app.js           state, notes, editor modes, tools, preview, runner, console
js/runner.js        sandboxed iframe runner + console bridge (injected into srcdoc)
api/index.php       optional PHP 7.4 JSON save/load (flat-file, token protected)
vendor/             codemirror 5, marked, DOMPurify (+ licences)
sw.js, manifest.webmanifest   offline / installable PWA
```

### Editor modes (one note, switchable at any time)
| Mode | Component | Notes |
|------|-----------|-------|
| **Plain** (default) | `<textarea>` | monospace, no formatting, no highlighting. Fastest, best mobile IME behaviour. |
| **Markdown** | CodeMirror 5 `gfm` mode | colourised source, no live preview; list continuation, toolbar helpers |
| **Code** | CodeMirror 5, language per note | JS, HTML, CSS, PHP, JSON, Python, SQL, XML, Shell, YAML, C-like, … |
| **Preview** | full-screen overlay | markdown render (sanitised) or HTML runner |

### Runner
- HTML (and JS/CSS combined) executed in a sandboxed `<iframe srcdoc sandbox="allow-scripts allow-modals allow-forms allow-popups">`.
- Console bridge posts `console.*`, uncaught errors and unhandled rejections to the parent.
- Console panel is toggleable, resizable by tapping a handle; preview is full-screen by default.

### Storage schema (`localStorage`)
- `ssn:v1:settings` – theme, font, size, wrap, line numbers, tab size, etc.
- `ssn:v1:notes`    – array of `{id,title,text,mode,lang,created,updated,pinned}`
- `ssn:v1:current`  – active note id
- Autosave debounced 400ms + on `visibilitychange`/`pagehide`.

### PHP
`api/index.php` — PHP 7.4 syntax only (no union types, no match, no `str_contains`, no arrow-fn-less features beyond 7.4).
Actions: `list`, `get`, `save`, `delete`. Data stored as JSON files in `data/` (protected by `.htaccess`).
Optional shared token in `api/config.php`. The app works fully without it.

## Themes (20)
Light: Paper, Solarized Light, Gruvbox Light, Rosé Dawn, Mint, GitHub Light
Dark: Midnight, Dracula, Nord, Solarized Dark, Gruvbox Dark, Monokai, Tokyo Night, One Dark, Ayu Mirage, Catppuccin Mocha, Everforest, Oceanic
High-contrast / special: Terminal Green, Amber CRT

## Milestones
See `TASKS.md`.
