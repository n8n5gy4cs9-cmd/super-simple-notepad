/* Jot — application. Wires store, editors, panels, tools, find, preview and sync together. */
(function (global) {
  'use strict';
  var S = global.JotStore, T = global.JotThemes, L = global.JotLangs, E = global.JotEditors, PV = global.JotPreview, SY = global.JotSync;
  var VERSION = '1.0.0';
  var $ = function (id) { return document.getElementById(id); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;

  var FALLBACK = ', ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  var FONTS = {
    jetbrains: '"JetBrains Mono"' + FALLBACK, plex: '"IBM Plex Mono"' + FALLBACK, fira: '"Fira Code"' + FALLBACK,
    source: '"Source Code Pro"' + FALLBACK, system: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    courier: '"Courier New", Courier, monospace'
  };

  var note = null, dirty = false, saveTimer = 0, countTimer = 0, plain, code = null, ed = null, mode = 'plain';
  var warnedFull = false, deferredInstall = null, loading = false;

  /* ============ helpers ============ */
  function titleOf(n) {
    if (n.title) return n.title;
    var s = n.snip !== undefined ? n.snip : ((n.text || '').match(/\S[^\n]{0,80}/) || [''])[0].trim().slice(0, 60);
    return s || 'Untitled';
  }
  function fmtDate(t) {
    var d = new Date(t), now = Date.now(), diff = now - t;
    if (diff < 60e3) return 'just now';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + 'm ago';
    if (diff < 86400e3 && new Date().getDate() === d.getDate()) return d.toTimeString().slice(0, 5);
    var o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(undefined, o);
  }
  function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  var toastTimer = 0;
  function toast(msg, action, ms) {
    var t = $('toast');
    t.textContent = msg;
    if (action) {
      var b = document.createElement('button');
      b.textContent = action.label; b.onclick = function () { t.classList.remove('on'); action.fn(); };
      t.appendChild(b);
    }
    t.classList.add('on');
    clearTimeout(toastTimer);
    if (ms !== 0) toastTimer = setTimeout(function () { t.classList.remove('on'); }, ms || (action ? 8000 : 2200));
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function safeName(s) { return (s || 'note').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 80) || 'note'; }
  function extOf(n) { return n.mode === 'md' ? 'md' : n.mode === 'code' ? (L.byId(n.lang) || { ext: 'txt' }).ext : 'txt'; }

  /* ============ settings → DOM ============ */
  function applySettings() {
    var st = S.settings, r = document.documentElement.style;
    T.apply(st.theme);
    r.setProperty('--mono', FONTS[st.font] || FONTS.jetbrains);
    r.setProperty('--fs', st.size + 'px');
    r.setProperty('--lh', String(st.lineHeight));
    r.setProperty('--measure', st.measure ? st.measure + 'ch' : '9999px');
    $('app').classList.toggle('no-past', !st.pastEnd);
    plain.apply(st);
    if (code) code.apply(st);
    updateTrays();
    qsa('[data-v]').forEach(function (el) { el.textContent = S.settings[el.getAttribute('data-v')]; });
    qsa('#s-themes .sw').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-id') === (st.theme || '') ? 'true' : 'false'); });
    if (code) code.refresh();
  }
  function layout() {
    var vv = global.visualViewport, root = document.documentElement.style;
    root.setProperty('--app-h', (vv ? vv.height : global.innerHeight) + 'px');
    root.setProperty('--app-top', (vv ? vv.offsetTop : 0) + 'px');
    if (vv && vv.offsetTop) global.scrollTo(0, 0);
  }

  /* ============ editors / modes ============ */
  function getCode() {
    if (!code) {
      code = new E.Code($('code'));
      code.onChange(onChange); code.onCursor(onCursor);
      code.apply(S.settings);
    }
    return code;
  }
  function modeSpec() {
    if (mode === 'md') return { name: 'gfm', highlightFormatting: true };
    var l = L.byId(note.lang) || L.byId('html');
    return l.id === 'md' ? { name: 'gfm', highlightFormatting: true } : l.mode;
  }
  function setEditorMode(m, initial) {
    var text = initial ? note.text : ed.getValue(), prev = ed;
    mode = m;
    if (m === 'plain') {
      if (code) code.hide();
      $('code').hidden = true;
      plain.show(); ed = plain;
    } else {
      $('code').hidden = false;
      var c = getCode();
      plain.hide(); c.show(); ed = c;
      c.setMode(modeSpec());
      c.el.classList.toggle('md-src', m === 'md' || note.lang === 'md');
    }
    if (prev !== ed || initial) { loading = true; ed.setValue(text); loading = false; }
    qsa('#modes button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === m ? 'true' : 'false'); });
    $('lang').hidden = m !== 'code';
    $('lang').value = note.lang;
    updateTrays(); updateRunBtn(); onCursor(); countSoon();
    if (!initial) ed.focus();
  }
  function switchMode(m) {
    if (m === mode) return;
    if (m === 'code' && !note.langSet) {                       // sniff a sensible default language once
      var t = ed.getValue().trim();
      note.lang = /^<\?php/.test(t) ? 'php' : /^<(!doctype|html|head|body|div|svg|p|h\d|script|style|\w+[\s>])/i.test(t) ? 'html' :
        /^[\[{]/.test(t) ? 'json' : /(^|\n)\s*(const|let|var|function|import|export|class)\s|=>|console\./.test(t) ? 'js' :
        /^\s*(def |import |from \w+ import)/m.test(t) ? 'py' : note.lang;
    }
    note.mode = m; touch();
    setEditorMode(m);
  }
  function setLang(id) {
    note.lang = id; note.langSet = true; touch();
    if (code && mode === 'code') { code.setMode(modeSpec()); code.el.classList.toggle('md-src', id === 'md'); }
    updateRunBtn();
  }
  function updateRunBtn() {
    var can = mode === 'md' || (mode === 'code' && L.runnable(note.lang));
    $('b-run').hidden = !can;
    $('b-run').classList.toggle('prev', mode === 'md' || note.lang === 'md');
    $('b-run').title = (mode === 'md' || note.lang === 'md') ? 'Preview (Ctrl+Enter)' : 'Run (Ctrl+Enter)';
  }

  /* ============ saving ============ */
  function touch() { note.updated = Date.now(); dirty = true; scheduleSave(); }
  function scheduleSave() { $('saved').className = 'dot dirty'; $('saved').title = 'Saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 350); }
  function flush() {
    clearTimeout(saveTimer);
    if (!dirty || !note) return;
    dirty = false;
    note.text = ed.getValue();
    var ok = S.put(note);
    $('saved').className = 'dot' + (ok ? '' : ' err');
    $('saved').title = ok ? 'Saved' : 'Could not save — storage full or blocked';
    if (!ok && !warnedFull) { warnedFull = true; toast('Storage is full or blocked — export a backup!', null, 6000); }
    SY.later(afterSync);
    document.title = titleOf(note) + ' — Jot';
    if (!$('notes').hidden) renderList();
  }
  function onChange() {
    if (loading) return;
    note.updated = Date.now(); dirty = true; scheduleSave(); countSoon();
    if (!note.title) $('title').placeholder = titleOf({ text: ed.getValue().slice(0, 200) });
    if (F.open && F.q()) { clearTimeout(F.t); F.t = setTimeout(F.count, 200); }
  }
  function countSoon() {
    clearTimeout(countTimer);
    countTimer = setTimeout(function () {
      var t = ed.getValue(), w = (t.match(/\S+/g) || []).length;
      $('count').textContent = w + ' words · ' + t.length + ' chars';
    }, 150);
  }
  function onCursor() {
    var c = ed.cursor(), s = ed.sel();
    $('pos').textContent = 'Ln ' + c.line + ', Col ' + c.col + (s.to > s.from ? ' · ' + (s.to - s.from) + ' sel' : '');
  }

  /* ============ notes ============ */
  function loadNote(id) {
    flush();
    var n = S.get(id);
    if (!n) return false;
    note = n;
    if (!note.lang) note.lang = 'html';
    S.setCurrent(id);
    $('title').value = note.title || '';
    $('title').placeholder = titleOf(note);
    document.title = titleOf(note) + ' — Jot';
    if (ed) setEditorMode(note.mode, true);
    return true;
  }
  function newNote(o) {
    flush();
    var n = S.create(o || {});
    if (!ed) { note = n; return; }
    loadNote(n.id);
    closeLayers();
    ed.focus();
    return n;
  }
  function duplicate() {
    flush();
    var c = S.create({ title: note.title ? note.title + ' copy' : '', text: ed.getValue(), mode: note.mode, lang: note.lang, langSet: note.langSet });
    loadNote(c.id); toast('Duplicated');
  }
  function deleteNote(id) {
    var m = S.meta(id);
    if (!m || !global.confirm('Delete “' + titleOf(m) + '”? This cannot be undone.')) return;
    if (note && id === note.id) { dirty = false; clearTimeout(saveTimer); }
    S.remove(id);
    SY.later(afterSync);
    if (note && id === note.id) {
      var rest = S.list().sort(function (a, b) { return b.updated - a.updated; });
      if (rest.length) loadNote(rest[0].id); else loadNote(S.create({}).id);
    }
    renderList(); toast('Deleted');
  }
  function togglePin(id) {
    var n = id === note.id ? note : S.get(id);
    n.pinned = !n.pinned;
    if (id === note.id) { dirty = true; flush(); } else S.put(n);
    renderList();
  }
  function renderList() {
    var q = $('n-q').value.trim().toLowerCase(), box = $('n-list'), items = S.list();
    if (note) { var cm = S.meta(note.id); if (cm && dirty) { cm.snip = titleOf({ text: ed.getValue().slice(0, 200) }); } }
    if (q) {
      items = items.filter(function (m) {
        if (titleOf(m).toLowerCase().indexOf(q) !== -1) return true;
        var n = S.get(m.id);
        return n && (n.text || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    items.sort(function (a, b) { return (b.pinned - a.pinned) || (b.updated - a.updated); });
    box.innerHTML = '';
    if (!items.length) { box.innerHTML = '<div class="empty">' + (q ? 'No notes match.' : 'No notes yet.') + '</div>'; }
    items.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'ni' + (note && m.id === note.id ? ' cur' : '');
      row.setAttribute('role', 'listitem');
      var main = document.createElement('button');
      main.className = 'main';
      var t = document.createElement('span'); t.className = 't'; t.textContent = titleOf(m);
      var meta = document.createElement('span'); meta.className = 'm';
      meta.textContent = fmtDate(m.updated) + ' · ' + (m.mode === 'plain' ? 'txt' : m.mode === 'md' ? 'md' : (m.lang || 'code')) + ' · ' + fmtSize(m.size);
      main.appendChild(t); main.appendChild(meta);
      main.onclick = function () { loadNote(m.id); closeLayers(); ed.focus(); };
      var pin = document.createElement('button');
      pin.className = 'ib' + (m.pinned ? ' on' : ''); pin.title = m.pinned ? 'Unpin' : 'Pin'; pin.setAttribute('aria-label', pin.title);
      pin.innerHTML = '<svg><use href="#i-pin"/></svg>'; pin.onclick = function () { togglePin(m.id); };
      var del = document.createElement('button');
      del.className = 'ib del'; del.title = 'Delete'; del.setAttribute('aria-label', 'Delete');
      del.innerHTML = '<svg><use href="#i-trash"/></svg>'; del.onclick = function () { deleteNote(m.id); };
      row.appendChild(main); row.appendChild(pin); row.appendChild(del);
      box.appendChild(row);
    });
    $('n-info').textContent = S.list().length + (S.list().length === 1 ? ' note · ' : ' notes · ') + fmtSize(S.bytes()) + ' used';
  }

  /* ============ layers (drawer / menu / settings) ============ */
  var layer = null;
  function openLayer(name) {
    closeLayers(true);
    layer = name;
    $('scrim').hidden = false; $(name).hidden = false;
    if (name === 'notes') { renderList(); if (!coarse) $('n-q').focus(); }
    if (name === 'settings') { updateUsage(); }
  }
  function closeLayers(keepFocus) {
    if (!layer) return;
    $(layer).hidden = true; $('scrim').hidden = true; layer = null;
    if (!keepFocus && ed) ed.focus();
  }

  /* ============ menu ============ */
  var TOOLS = [
    ['Sort lines A → Z', function (s) { return s.split('\n').sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }).join('\n'); }],
    ['Sort lines Z → A', function (s) { return s.split('\n').sort(function (a, b) { return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }); }).join('\n'); }],
    ['Reverse lines', function (s) { return s.split('\n').reverse().join('\n'); }],
    ['Remove duplicate lines', function (s) { var seen = {}; return s.split('\n').filter(function (l) { if (seen[l]) return false; seen[l] = 1; return true; }).join('\n'); }],
    ['Remove empty lines', function (s) { return s.split('\n').filter(function (l) { return l.trim(); }).join('\n'); }],
    ['Trim trailing spaces', function (s) { return s.replace(/[ \t]+$/gm, ''); }],
    ['Join lines', function (s) { return s.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join(' '); }],
    ['Number lines', function (s) { return s.split('\n').map(function (l, i) { return (i + 1) + '. ' + l; }).join('\n'); }],
    ['UPPERCASE', function (s) { return s.toUpperCase(); }],
    ['lowercase', function (s) { return s.toLowerCase(); }],
    ['Title Case', function (s) { return s.toLowerCase().replace(/(^|[\s(\-"'])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); }); }],
    ['Tabs → spaces', function (s) { return s.replace(/\t/g, new Array(S.settings.tabSize + 1).join(' ')); }],
    ['Format JSON', function (s) { return JSON.stringify(JSON.parse(s), null, S.settings.tabs ? '\t' : S.settings.tabSize); }],
    ['Minify JSON', function (s) { return JSON.stringify(JSON.parse(s)); }],
    ['URL encode', function (s) { return encodeURIComponent(s); }],
    ['URL decode', function (s) { return decodeURIComponent(s); }],
    ['Base64 encode', function (s) { return btoa(unescape(encodeURIComponent(s))); }],
    ['Base64 decode', function (s) { return decodeURIComponent(escape(atob(s.trim()))); }]
  ];
  function transform(fn) {
    var t = ed.getValue(), s = ed.sel(), whole = s.from === s.to, a = whole ? 0 : s.from, b = whole ? t.length : s.to, src = t.slice(a, b), out;
    try { out = fn(src); } catch (e) { toast('Failed: ' + (e.message || e)); return; }
    if (out === src) { toast('Nothing to change'); return; }
    ed.replaceRange(a, b, out); ed.setSel(a, a + out.length); ed.focus();
  }
  function stats() {
    var t = ed.getValue(), w = (t.match(/\S+/g) || []).length;
    toast(w + ' words · ' + t.length + ' characters · ' + ed.lineCount() + ' lines · ' + fmtSize(new Blob([t]).size), null, 4000);
  }
  function copyAll() {
    var t = ed.getValue();
    var done = function () { toast('Copied ' + t.length + ' characters'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() { try { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) { toast('Copy failed'); } }
  }
  function stamp(withTime) {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    ed.insert(withTime ? s + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) : s); ed.focus();
  }
  function gotoLine() {
    var v = global.prompt('Go to line (1–' + ed.lineCount() + ')');
    if (v && /^\d+$/.test(v.trim())) ed.goto(parseInt(v, 10));
  }
  function setZen(on) {
    $('app').classList.toggle('zen', on); $('zen-exit').hidden = !on;
    if (code) code.refresh();
    ed.focus();
  }

  function buildMenu(view) {
    var m = $('menu'); m.innerHTML = '';
    function item(label, hint, fn, cls, keep) {
      var b = document.createElement('button');
      b.className = 'mi' + (cls ? ' ' + cls : ''); b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span></span><span class="k"></span>';
      b.firstChild.textContent = label; b.lastChild.textContent = hint || '';
      b.onclick = function () { if (keep) fn(); else { closeLayers(true); fn(); } };
      m.appendChild(b); return b;
    }
    function head(t) { var h = document.createElement('div'); h.className = 'mh'; h.textContent = t; m.appendChild(h); }
    if (view === 'tools') {
      var back = item('Text tools', '', function () { buildMenu('main'); }, 'back', true);
      back.firstChild.innerHTML = '<svg style="vertical-align:-3px"><use href="#i-left"/></svg> Text tools';
      head(ed.sel().from === ed.sel().to ? 'Applies to the whole note' : 'Applies to the selection');
      TOOLS.forEach(function (t) { item(t[0], '', function () { transform(t[1]); }); });
      item('Insert date', '', function () { stamp(false); });
      item('Insert date & time', '', function () { stamp(true); });
      return;
    }
    var q = document.createElement('div'); q.className = 'qrow';
    [['Undo', 'i-undo', function () { ed.undo(); }], ['Redo', 'i-redo', function () { ed.redo(); }], ['Copy all', 'i-copy', copyAll], ['Focus mode', 'i-zen', function () { setZen(true); }]].forEach(function (a) {
      var b = document.createElement('button'); b.title = a[0]; b.setAttribute('aria-label', a[0]);
      b.innerHTML = '<svg><use href="#' + a[1] + '"/></svg>';
      b.onclick = function () { closeLayers(true); a[2](); };
      q.appendChild(b);
    });
    m.appendChild(q);
    item('New note', 'Alt+N', function () { newNote(); });
    item('Duplicate note', '', duplicate);
    item('Open file…', '', function () { $('file').click(); });
    item('Download .' + extOf(note), '', function () { flush(); download(safeName(titleOf(note)) + '.' + extOf(note), ed.getValue()); });
    if (mode === 'md' || note.lang === 'md') item('Download as HTML', '', function () { download(safeName(titleOf(note)) + '.html', PV.standalone({ title: titleOf(note), text: ed.getValue() }), 'text/html'); });
    if (navigator.share) item('Share…', '', function () { navigator.share({ title: titleOf(note), text: ed.getValue() }).catch(function () {}); });
    item('Text tools', '›', function () { buildMenu('tools'); }, '', true);
    item('Find & replace', 'Ctrl+F', function () { openFind(true); });
    item('Go to line…', '', gotoLine);
    item('Statistics', '', stats);
    var w = item('Wrap lines', S.settings.wrap ? 'on' : 'off', function () { S.setting('wrap', !S.settings.wrap); syncSettingsUI(); applySettings(); }, S.settings.wrap ? 'on' : '');
    if (mode !== 'plain' && code) {
      item('Fold all', '', function () { code.fold(true); });
      item('Unfold all', '', function () { code.fold(false); });
    }
    item('Settings & themes', 'Ctrl+,', function () { openLayer('settings'); });
    if (deferredInstall) item('Install app', '', function () { deferredInstall.prompt(); deferredInstall = null; });
    item('Check for updates', '', checkUpdate);
    item('Delete note', '', function () { deleteNote(note.id); }, 'danger');
    void w;
  }
  function openMenu() { if (layer === 'menu') return closeLayers(); buildMenu('main'); openLayer('menu'); }

  /* ============ find & replace ============ */
  var F = {
    open: false, t: 0, flags: { c: false, r: false, w: false },
    q: function () { return $('f-q').value; },
    re: function (global_) {
      var q = $('f-q').value; if (!q) return null;
      var src = F.flags.r ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (F.flags.w) src = '\\b(?:' + src + ')\\b';
      try { return new RegExp(src, (global_ === false ? '' : 'g') + (F.flags.c ? '' : 'i') + 'mu'.slice(0, 1)); } catch (e) { return 'bad'; }
    },
    all: function () {
      var re = F.re(), t = ed.getValue(), out = [], m, guard = 0;
      if (!re || re === 'bad') return out;
      while ((m = re.exec(t)) && guard++ < 50000) { if (!m[0].length) { re.lastIndex++; continue; } out.push([m.index, m.index + m[0].length]); }
      return out;
    },
    count: function () {
      var el = $('f-count'), re = F.re();
      if (!F.q()) { el.textContent = ''; return; }
      if (re === 'bad') { el.textContent = 'bad regex'; return; }
      var list = F.all(), s = ed.sel(), k = -1;
      list.forEach(function (m, i) { if (m[0] === s.from && m[1] === s.to) k = i; });
      el.textContent = !list.length ? 'none' : (k >= 0 ? (k + 1) + '/' : '') + list.length;
    },
    step: function (dir) {
      var list = F.all(), s = ed.sel(), pick = null, i;
      if (!list.length) { F.count(); if (F.q()) toast('No matches'); return null; }
      if (dir > 0) { for (i = 0; i < list.length; i++) if (list[i][0] >= s.to && !(list[i][0] === s.from && list[i][1] === s.to)) { pick = list[i]; break; } pick = pick || list[0]; }
      else { for (i = list.length - 1; i >= 0; i--) if (list[i][1] <= s.from) { pick = list[i]; break; } pick = pick || list[list.length - 1]; }
      ed.setSel(pick[0], pick[1]); ed.reveal(); F.count();
      return pick;
    },
    replaceOne: function () {
      var re = F.re(false), s = ed.sel(), t = ed.getValue();
      if (!re || re === 'bad') return;
      var cur = t.slice(s.from, s.to), m = s.to > s.from ? new RegExp('^(?:' + re.source + ')$', re.flags).exec(cur) : null;
      if (!m) { F.step(1); return; }
      var rep = $('f-r').value, out = F.flags.r ? cur.replace(new RegExp(re.source, re.flags), rep) : rep;
      ed.replaceRange(s.from, s.to, out); ed.setSel(s.from + out.length);
      F.step(1); $('f-r').focus();
    },
    replaceAll: function () {
      var re = F.re(), rep = $('f-r').value, t = ed.getValue(), n = 0;
      if (!re || re === 'bad') return;
      var out = t.replace(re, function () { n++; if (!F.flags.r) return rep; var a = arguments, m = a[0]; return m.replace(new RegExp(re.source, re.flags.replace('g', '')), rep); });
      if (!n) { toast('No matches'); return; }
      ed.replaceRange(0, t.length, out); toast('Replaced ' + n); F.count();
    }
  };
  function openFind(withReplace) {
    closeLayers(true);
    var s = ed.sel(), sel = ed.getValue().slice(s.from, s.to);
    $('find').hidden = false; F.open = true;
    if (sel && sel.indexOf('\n') < 0 && sel.length < 200) $('f-q').value = sel;
    if (typeof withReplace === 'boolean') $('f-rrow').hidden = !withReplace;
    $('f-q').focus(); $('f-q').select(); F.count();
  }
  function closeFind() { $('find').hidden = true; F.open = false; ed.focus(); }

  /* ============ markdown toolbar & key row ============ */
  function wrapSel(before, after, ph) {
    var s = ed.sel(), t = ed.getValue(), x = t.slice(s.from, s.to) || ph || '';
    if (s.to > s.from && t.slice(s.from - before.length, s.from) === before && t.slice(s.to, s.to + after.length) === after) {   // unwrap
      ed.replaceRange(s.from - before.length, s.to + after.length, x); ed.setSel(s.from - before.length, s.from - before.length + x.length); return;
    }
    ed.replaceRange(s.from, s.to, before + x + after);
    ed.setSel(s.from + before.length, s.from + before.length + x.length);
  }
  function linePrefix(fn) {            // fn(line, index) -> new line
    var s = ed.sel(), t = ed.getValue(), a = t.lastIndexOf('\n', s.from - 1) + 1, e = t.indexOf('\n', s.to > s.from ? s.to - 1 : s.to);
    if (e < 0) e = t.length;
    var out = t.slice(a, e).split('\n').map(fn).join('\n');
    ed.replaceRange(a, e, out); ed.setSel(a, a + out.length);
  }
  function toggleLine(re, add) {
    linePrefix(function (l) { return re.test(l) ? l.replace(re, '') : add + l; });
  }
  var MD = [
    ['H1', 'Heading 1', function () { linePrefix(function (l) { return /^#{1,6} /.test(l) ? l.replace(/^#{1,6} /, '# ') : '# ' + l; }); }],
    ['H2', 'Heading 2', function () { linePrefix(function (l) { return /^#{1,6} /.test(l) ? l.replace(/^#{1,6} /, '## ') : '## ' + l; }); }],
    ['H3', 'Heading 3', function () { linePrefix(function (l) { return /^#{1,6} /.test(l) ? l.replace(/^#{1,6} /, '### ') : '### ' + l; }); }],
    ['<b>B</b>', 'Bold (Ctrl+B)', function () { wrapSel('**', '**', 'bold'); }],
    ['<i>I</i>', 'Italic (Ctrl+I)', function () { wrapSel('*', '*', 'italic'); }],
    ['<s>S</s>', 'Strikethrough', function () { wrapSel('~~', '~~', 'text'); }],
    ['`', 'Inline code', function () { wrapSel('`', '`', 'code'); }],
    ['```', 'Code block', function () { var s = ed.sel(), x = ed.getValue().slice(s.from, s.to) || 'code'; ed.replaceRange(s.from, s.to, '```\n' + x + '\n```\n'); ed.setSel(s.from + 4, s.from + 4 + x.length); }],
    ['link', 'Link', function () {
      var s = ed.sel(), x = ed.getValue().slice(s.from, s.to) || 'text', pre = '[' + x + '](';
      ed.replaceRange(s.from, s.to, pre + 'https://)'); ed.setSel(s.from + pre.length, s.from + pre.length + 8);
    }],
    ['img', 'Image', function () { var s = ed.sel(), x = ed.getValue().slice(s.from, s.to) || 'alt', pre = '![' + x + ']('; ed.replaceRange(s.from, s.to, pre + 'https://)'); ed.setSel(s.from + pre.length, s.from + pre.length + 8); }],
    ['•', 'Bullet list', function () { toggleLine(/^[-*+] /, '- '); }],
    ['1.', 'Numbered list', function () { var n = 0; linePrefix(function (l) { return /^\d+\. /.test(l) ? l.replace(/^\d+\. /, '') : (++n) + '. ' + l; }); }],
    ['☐', 'Task list', function () { linePrefix(function (l) { return /^[-*] \[[ x]\] /.test(l) ? l.replace(/^[-*] \[[ x]\] /, '') : '- [ ] ' + l; }); }],
    ['❝', 'Quote', function () { toggleLine(/^> ?/, '> '); }],
    ['—', 'Horizontal rule', function () { var s = ed.sel(); ed.replaceRange(s.from, s.to, '\n---\n'); }],
    ['▦', 'Table', function () { var s = ed.sel(), tb = '| Column | Column |\n| ------ | ------ |\n| Cell   | Cell   |\n'; ed.replaceRange(s.from, s.to, tb); ed.setSel(s.from + 2, s.from + 8); }],
    ['|', null],
    ['⇥', 'Indent', function () { ed.insert(ed.sel().from === ed.sel().to ? '  ' : ''); if (ed.sel().from !== ed.sel().to) linePrefix(function (l) { return '  ' + l; }); }],
    ['⇤', 'Outdent', function () { linePrefix(function (l) { return l.replace(/^( {1,2}|\t)/, ''); }); }]
  ];
  var KEYS = ['Tab', '←', '→', '↑', '↓', '{', '}', '(', ')', '[', ']', '<', '>', '/', '\\', '"', "'", '`', ';', ':', '=', '+', '-', '*', '_', '|', '&', '!', '?', '#', '$', '%', '^', '~', '@', ',', '.'];
  function buildTrays() {
    var md = $('mdbar');
    MD.forEach(function (it) {
      if (it[1] === null) { var s = document.createElement('span'); s.className = 'sep'; md.appendChild(s); return; }
      var b = document.createElement('button'); b.innerHTML = it[0]; b.title = it[1]; b.setAttribute('aria-label', it[1]);
      b.onclick = function () { it[2](); ed.focus(); };
      md.appendChild(b);
    });
    var k = $('keys');
    KEYS.forEach(function (key) {
      var b = document.createElement('button'); b.textContent = key;
      b.onclick = function () {
        if (key === 'Tab') ed.insert(S.settings.tabs ? '\t' : new Array(S.settings.tabSize + 1).join(' '));
        else if (key === '←') ed.move(-1, 0); else if (key === '→') ed.move(1, 0);
        else if (key === '↑') ed.move(0, -1); else if (key === '↓') ed.move(0, 1);
        else ed.insert(key);
        ed.focus();
      };
      k.appendChild(b);
    });
    // keep the on-screen keyboard (and focus) when tapping tool buttons
    [md, k, $('bar'), $('modes'), $('find')].forEach(function (el) {
      ['pointerdown', 'mousedown'].forEach(function (ev) {
        el.addEventListener(ev, function (e) { if (e.target.closest('button') && !e.target.closest('#f-rep,#f-all')) e.preventDefault(); });
      });
    });
  }
  function updateTrays() {
    if (!note) return;
    var want = S.settings.keys === 'on' || (S.settings.keys === 'auto' && coarse);
    $('mdbar').hidden = !(mode === 'md' && S.settings.keys !== 'off');
    $('keys').hidden = !(mode === 'code' && want);
    if (code) code.refresh();
  }

  /* ============ files ============ */
  function importFiles(files) {
    var list = Array.prototype.slice.call(files), last = null, n = 0;
    (function next() {
      var f = list.shift();
      if (!f) {
        if (last) { loadNote(last); closeLayers(true); ed.focus(); }
        toast(n ? 'Opened ' + n + (n > 1 ? ' files' : ' file') : 'Nothing opened'); return;
      }
      if (f.size > 6 * 1024 * 1024) { toast(f.name + ' is too large (6 MB max)'); return next(); }
      var r = new FileReader();
      r.onload = function () {
        var text = String(r.result), m = f.name.match(/^(.*?)(?:\.([^.]+))?$/), ext = (m[2] || '').toLowerCase();
        if (text.indexOf('\u0000') !== -1) { toast(f.name + ' looks binary'); return next(); }
        var l = L.byExt(ext), o = { title: m[1] || f.name, text: text, mode: 'plain' };
        if (ext === 'md' || ext === 'markdown') o.mode = 'md';
        else if (l && ext !== 'txt') { o.mode = 'code'; o.lang = l.id; o.langSet = true; }
        last = S.create(o).id; n++; next();
      };
      r.onerror = function () { toast('Could not read ' + f.name); next(); };
      r.readAsText(f);
    })();
  }
  function exportBackup() {
    flush();
    download('jot-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S.exportAll(), null, 1), 'application/json');
  }
  function importBackup(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        if (!j || j.app !== 'jot' || !Array.isArray(j.notes)) throw new Error('Not a Jot backup');
        flush();
        var c = S.merge(j.notes);
        loadNote(note.id) || loadNote(S.list()[0].id);
        renderList(); updateUsage(); toast('Imported ' + c + ' note' + (c === 1 ? '' : 's'));
      } catch (e) { toast('Import failed: ' + e.message); }
    };
    r.readAsText(file);
  }

  /* ============ settings UI ============ */
  function syncSettingsUI() {
    qsa('[data-s]').forEach(function (el) {
      var v = S.settings[el.getAttribute('data-s')];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
  }
  function buildThemes() {
    var box = $('s-themes');
    function sw(id, name, c, dark) {
      var b = document.createElement('button');
      b.className = 'sw'; b.setAttribute('role', 'radio'); b.setAttribute('data-id', id);
      b.style.background = c.bg; b.style.color = c.fg;
      b.innerHTML = '<span class="pre"><span style="color:' + c.kw + '">const</span> <span style="color:' + c.fn + '">jot</span> = <span style="color:' + c.str + '">"hi"</span>\n<span style="color:' + c.com + '">// ' + (dark ? 'dark' : 'light') + '</span> <span style="color:' + c.num + '">42</span></span><span class="nm" style="background:' + c.ui + ';color:' + c.fg + '"></span>';
      b.lastChild.textContent = name;
      b.onclick = function () { S.setting('theme', id); applySettings(); };
      box.appendChild(b);
    }
    var a = T.find('paper'), d = T.find('ember');
    sw('', 'Auto (system)', global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? d.c : a.c, !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches));
    T.list.forEach(function (t) { sw(t.id, t.name, t.c, t.dark); });
  }
  function updateUsage() {
    $('s-usage').textContent = S.list().length + (S.list().length === 1 ? ' note · ' : ' notes · ') + fmtSize(S.bytes()) + ' of browser storage' + (S.persistent() ? '' : ' · ⚠ browser storage is unavailable, notes will be lost on close');
  }
  function syncMsg(t, bad) { var m = $('s-syncmsg'); m.textContent = t; m.style.color = bad ? '#e5534b' : ''; }
  function afterSync(r) {
    if (!r || !r.changed) return;
    var m = S.meta(note.id);
    if (m && m.updated > note.updated && !dirty) loadNote(note.id);
    if (!S.meta(note.id)) loadNote(S.create({}).id);
    renderList();
  }
  function checkUpdate() {
    if (!('serviceWorker' in navigator)) { toast('Reloading…'); return location.reload(); }
    toast('Checking…');
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return location.reload();
      return reg.update().then(function () { setTimeout(function () { toast('You are on the latest version (' + VERSION + ')'); }, 1200); });
    }).catch(function () { location.reload(); });
  }

  /* ============ preview ============ */
  function togglePreview() {
    if (PV.isOpen()) { PV.close(); return; }
    if ($('b-run').hidden) { toast('Switch to Markdown or Code (HTML / JS) to preview'); return; }
    flush();
    var get = function () { return { title: titleOf(note), text: ed.getValue(), mode: note.mode, lang: note.lang }; };
    PV.open(get(), get);
  }

  /* ============ init ============ */
  function bind() {
    $('b-notes').onclick = function () { layer === 'notes' ? closeLayers() : openLayer('notes'); };
    $('b-more').onclick = openMenu;
    $('b-find').onclick = function () { F.open ? closeFind() : openFind(); };
    $('b-run').onclick = togglePreview;
    $('b-undo').onclick = function () { ed.undo(); };
    $('b-redo').onclick = function () { ed.redo(); };
    $('scrim').onclick = function () { closeLayers(); };
    qsa('[data-close]').forEach(function (b) { b.onclick = function () { closeLayers(); }; });
    $('n-new').onclick = function () { newNote(); };
    $('n-q').oninput = renderList;
    $('zen-exit').onclick = function () { setZen(false); };
    qsa('#modes button').forEach(function (b) { b.onclick = function () { switchMode(b.getAttribute('data-m')); }; });
    $('lang').onchange = function () { setLang(this.value); };
    $('title').addEventListener('input', function () { note.title = this.value.trim(); touch(); });
    $('title').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ed.focus(); } });

    // find
    $('f-q').addEventListener('input', function () { F.count(); });
    $('f-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); F.step(e.shiftKey ? -1 : 1); } });
    $('f-r').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); F.replaceOne(); } });
    $('f-next').onclick = function () { F.step(1); };
    $('f-prev').onclick = function () { F.step(-1); };
    $('f-close').onclick = closeFind;
    $('f-swap').onclick = function () { $('f-rrow').hidden = !$('f-rrow').hidden; if (!$('f-rrow').hidden) $('f-r').focus(); };
    $('f-rep').onclick = F.replaceOne; $('f-all').onclick = F.replaceAll;
    [['f-case', 'c'], ['f-re', 'r'], ['f-word', 'w']].forEach(function (a) {
      $(a[0]).onclick = function () { F.flags[a[1]] = !F.flags[a[1]]; this.setAttribute('aria-pressed', F.flags[a[1]]); F.count(); };
    });

    // settings
    qsa('[data-s]').forEach(function (el) {
      el.addEventListener('input', function () {
        var k = el.getAttribute('data-s'), v = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.hasAttribute('data-num')) ? parseFloat(el.value) : el.value;
        S.setting(k, v); applySettings();
      });
    });
    $('s-test').onclick = function () {
      syncMsg('Testing…');
      SY.test().then(function (j) { syncMsg('Connected ✓ (PHP ' + j.php + ')'); }, function (e) { syncMsg(e.message, true); });
    };
    $('s-sync').onclick = function () {
      flush(); syncMsg('Syncing…');
      SY.run().then(function (r) { syncMsg('Synced ✓ ' + (r.changed ? r.changed + ' note(s) updated from server' : 'everything up to date')); afterSync(r); updateUsage(); }, function (e) { syncMsg(e.message, true); });
    };
    $('s-export').onclick = exportBackup;
    $('s-import').onclick = function () { $('file-backup').click(); };
    $('file-backup').onchange = function () { if (this.files[0]) importBackup(this.files[0]); this.value = ''; };
    $('s-reset').onclick = function () { if (global.confirm('Reset all settings to defaults? Notes are kept.')) { S.resetSettings(); syncSettingsUI(); applySettings(); toast('Settings reset'); } };
    $('s-wipe').onclick = function () {
      if (!global.confirm('Delete ALL notes and settings from this browser? This cannot be undone.')) return;
      if (!global.confirm('Really delete everything? Export a backup first if unsure.')) return;
      dirty = false; clearTimeout(saveTimer); S.wipe(); location.reload();
    };
    $('file').onchange = function () { importFiles(this.files); this.value = ''; };

    // drag & drop
    var dc = 0;
    global.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { dc++; document.body.classList.add('drop'); } });
    global.addEventListener('dragleave', function () { if (--dc <= 0) { dc = 0; document.body.classList.remove('drop'); } });
    global.addEventListener('dragover', function (e) { e.preventDefault(); });
    global.addEventListener('drop', function (e) { e.preventDefault(); dc = 0; document.body.classList.remove('drop'); if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files); });

    // persistence
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    global.addEventListener('pagehide', flush);
    global.addEventListener('beforeunload', flush);
    global.addEventListener('storage', function (e) {
      if (e.key && e.key.indexOf('jot:v1:index') === 0) { S.reload(); if (!$('notes').hidden) renderList(); }
      else if (note && e.key === 'jot:v1:n:' + note.id && !dirty && e.newValue) { loadNote(note.id); toast('Updated from another tab'); }
    });

    // layout / keyboard
    if (global.visualViewport) { global.visualViewport.addEventListener('resize', layout); global.visualViewport.addEventListener('scroll', layout); }
    global.addEventListener('resize', layout);
    global.addEventListener('orientationchange', function () { setTimeout(layout, 200); });
    if (global.ResizeObserver) new ResizeObserver(function () { if (code && mode !== 'plain') code.refresh(); }).observe($('ed'));
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onMq = function () { if (!S.settings.theme) applySettings(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    global.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; });
    global.addEventListener('appinstalled', function () { deferredInstall = null; toast('Installed'); });

    // keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (e.key === 'Escape') {
        if (PV.isOpen()) { PV.close(); e.preventDefault(); }
        else if (layer) { closeLayers(); e.preventDefault(); }
        else if (F.open) { closeFind(); e.preventDefault(); }
        else if ($('app').classList.contains('zen')) { setZen(false); e.preventDefault(); }
        return;
      }
      if (e.key === 'F3') { e.preventDefault(); F.open || openFind(); F.step(e.shiftKey ? -1 : 1); return; }
      if (e.altKey && !mod && k === 'n') { e.preventDefault(); newNote(); return; }
      if (!mod) return;
      if (k === 's') { e.preventDefault(); flush(); toast('Saved'); if (SY.configured()) SY.run().then(afterSync, function (er) { toast('Sync failed: ' + er.message); }); }
      else if (k === 'enter') { e.preventDefault(); if (PV.isOpen()) PV.reload(); else togglePreview(); }
      else if (k === 'f' && !e.shiftKey) { e.preventDefault(); openFind(); }
      else if (k === 'h') { e.preventDefault(); openFind(true); }
      else if (k === 'k' && !e.shiftKey) { e.preventDefault(); layer === 'notes' ? closeLayers() : openLayer('notes'); }
      else if (k === ',') { e.preventDefault(); openLayer('settings'); }
      else if (k === '.') { e.preventDefault(); setZen(!$('app').classList.contains('zen')); }
      else if (k === 'm' && e.shiftKey) { e.preventDefault(); switchMode(mode === 'plain' ? 'md' : mode === 'md' ? 'code' : 'plain'); }
      else if (mode === 'md' && !PV.isOpen() && document.activeElement && ed.el.contains(document.activeElement) && (k === 'b' || k === 'i')) { e.preventDefault(); wrapSel(k === 'b' ? '**' : '*', k === 'b' ? '**' : '*', k === 'b' ? 'bold' : 'italic'); }
      else if (k === 'g' && F.open) { e.preventDefault(); F.step(e.shiftKey ? -1 : 1); }
    }, true);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    var had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!had) { had = true; return; }             // first install, nothing to reload for
      flush();
      toast('Jot was updated', { label: 'Reload', fn: function () { location.reload(); } }, 0);
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      reg.update();
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update(); });
      setInterval(function () { reg.update(); }, 30 * 60 * 1000);
    }).catch(function () {});
  }

  function init() {
    plain = new E.Plain($('plain'));
    plain.onChange(onChange); plain.onCursor(onCursor);
    ed = plain;
    // language list
    $('lang').innerHTML = L.list.map(function (l) { return '<option value="' + l.id + '">' + l.label + '</option>'; }).join('');
    PV.init();
    buildThemes(); buildTrays(); syncSettingsUI(); bind();
    $('s-ver').textContent = 'v' + VERSION;
    layout();
    applySettings();

    // which note first?
    var params = new URLSearchParams(location.search), id = S.current(), first = null;
    var wantNew = params.get('new') === '1' || S.settings.startWith === 'new';
    var blank = S.list().filter(function (m) { return !m.size && !m.title; })[0];      // reuse an empty note instead of piling up blanks
    if (wantNew) first = blank ? blank.id : S.create({}).id;
    else if (id && S.meta(id)) first = id;
    else if (S.list().length) first = S.list().sort(function (a, b) { return b.updated - a.updated; })[0].id;
    else first = S.create({}).id;
    loadNote(first);
    if (params.get('new')) history.replaceState(null, '', location.pathname);
    $('saved').className = 'dot';
    if (!coarse) ed.focus();
    registerSW();
    if (global.navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    if (S.settings.syncAuto && SY.configured()) SY.run().then(afterSync, function () {});
    if (!S.persistent()) toast('Browser storage is blocked — notes will not be kept', null, 6000);
  }

  global.JotApp = {
    focus: function () { if (ed) ed.focus(); },
    editor: function () { return ed; }, note: function () { return note; }, mode: function () { return mode; },
    flush: flush, setMode: switchMode, toast: toast, version: VERSION
  };
  init();
})(window);
