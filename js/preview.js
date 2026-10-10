/* Jot — fullscreen preview: sanitised Markdown render, sandboxed HTML/JS runner, console. */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = global.JotStore;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ---------- markdown ---------- */
  var mdReady = false;
  function initMd() {
    if (mdReady || !global.marked) return;
    mdReady = true;
    global.marked.use({
      gfm: true, breaks: false,
      renderer: {
        code: function (code, info) {
          var word = (info || '').match(/\S*/)[0], l = global.JotLangs.byExt(word), html = '';
          if (l && global.CodeMirror && global.CodeMirror.runMode) {
            global.CodeMirror.runMode(code, l.mode, function (t, style) {
              html += style ? '<span class="cm-' + style.replace(/ +/g, ' cm-') + '">' + esc(t) + '</span>' : esc(t);
            });
          } else html = esc(code);
          return '<pre class="cm-s-syn"><code>' + html + '</code></pre>\n';
        }
      }
    });
    if (global.DOMPurify) {
      global.DOMPurify.addHook('afterSanitizeAttributes', function (n) {
        if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
      });
    }
  }
  function renderMarkdown(text) {
    initMd();
    var raw = global.marked.parse(text || '');
    return global.DOMPurify ? global.DOMPurify.sanitize(raw) : esc(raw);
  }

  /* ---------- console bridge (runs INSIDE the sandboxed iframe; must be self-contained) ---------- */
  function bridge(token) {
    var post = function (o) { o.jot = 1; o.token = token; try { parent.postMessage(o, '*'); } catch (e) {} };
    function ser(v, d, seen) {
      d = d || 0; seen = seen || [];
      var t = typeof v;
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (t === 'string') return d ? JSON.stringify(v) : v;
      if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
      if (t === 'symbol') return v.toString();
      if (t === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()';
      if (v instanceof Error) return (v.stack || (v.name + ': ' + v.message));
      if (typeof Node !== 'undefined' && v instanceof Node) return v.outerHTML ? v.outerHTML.slice(0, 200) : String(v);
      if (seen.indexOf(v) !== -1) return '[Circular]';
      if (d > 3) return Array.isArray(v) ? '[…]' : '{…}';
      seen = seen.concat([v]);
      try {
        if (v instanceof Date) return v.toISOString();
        if (v instanceof RegExp) return String(v);
        if (typeof Map !== 'undefined' && v instanceof Map) { var m = []; v.forEach(function (x, k) { m.push(ser(k, d + 1, seen) + ' => ' + ser(x, d + 1, seen)); }); return 'Map(' + v.size + ') {' + m.join(', ') + '}'; }
        if (typeof Set !== 'undefined' && v instanceof Set) { var s = []; v.forEach(function (x) { s.push(ser(x, d + 1, seen)); }); return 'Set(' + v.size + ') {' + s.join(', ') + '}'; }
        if (Array.isArray(v)) { var a = v.slice(0, 100).map(function (x) { return ser(x, d + 1, seen); }); if (v.length > 100) a.push('…' + (v.length - 100) + ' more'); return '[' + a.join(', ') + ']'; }
        var keys = Object.keys(v).slice(0, 60), o = keys.map(function (k) { return k + ': ' + ser(v[k], d + 1, seen); });
        var nm = v.constructor && v.constructor.name && v.constructor.name !== 'Object' ? v.constructor.name + ' ' : '';
        return nm + '{' + o.join(', ') + '}';
      } catch (e) { return '[unprintable]'; }
    }
    function fmt(args) {
      var a = [].slice.call(args), first = a[0];
      if (typeof first === 'string' && first.indexOf('%') !== -1 && a.length > 1) {
        a.shift();
        first = first.replace(/%[sdifoOjc%]/g, function (m) {
          if (m === '%%') return '%';
          if (!a.length) return m;
          var x = a.shift();
          if (m === '%c') return '';
          if (m === '%d' || m === '%i') return String(parseInt(x, 10));
          if (m === '%f') return String(parseFloat(x));
          return ser(x, m === '%s' ? 0 : 1);
        });
        a.unshift(first);
      }
      return a.map(function (x) { return ser(x, 0); }).join(' ');
    }
    ['log', 'info', 'warn', 'error', 'debug'].forEach(function (k) {
      var orig = console[k];
      console[k] = function () { post({ level: k, text: fmt(arguments) }); try { orig && orig.apply(console, arguments); } catch (e) {} };
    });
    console.table = function (x) { post({ level: 'log', text: ser(x, 1) }); };
    console.dir = function (x) { post({ level: 'log', text: ser(x, 1) }); };
    console.clear = function () { post({ clear: 1 }); };
    console.assert = function (c) { if (!c) post({ level: 'error', text: 'Assertion failed: ' + fmt([].slice.call(arguments, 1)) }); };
    var timers = {}, counts = {};
    console.time = function (l) { timers[l || 'default'] = performance.now(); };
    console.timeEnd = console.timeLog = function (l) { l = l || 'default'; if (timers[l] !== undefined) post({ level: 'log', text: l + ': ' + (performance.now() - timers[l]).toFixed(2) + ' ms' }); };
    console.count = function (l) { l = l || 'default'; counts[l] = (counts[l] || 0) + 1; post({ level: 'log', text: l + ': ' + counts[l] }); };
    window.addEventListener('error', function (e) {
      if (e.target && e.target !== window && (e.target.src || e.target.href)) { post({ level: 'warn', text: 'Failed to load: ' + (e.target.src || e.target.href) }); return; }
      post({ level: 'error', text: (e.message || 'Error') + (e.filename ? '\n    at ' + (e.lineno ? 'line ' + e.lineno + ':' + e.colno : '') : '') });
    }, true);
    window.addEventListener('unhandledrejection', function (e) { post({ level: 'error', text: 'Unhandled promise rejection: ' + ser(e.reason, 0) }); });
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.jot !== 'eval' || d.token !== token) return;
      post({ level: 'cmd', text: d.code });
      try { var r = (0, eval)(d.code); post({ level: 'result', text: ser(r, 1) }); }
      catch (err) { post({ level: 'error', text: String(err && err.stack || err) }); }
    });
    window.addEventListener('DOMContentLoaded', function () { post({ level: 'sys', text: 'DOMContentLoaded' }); });
    post({ level: 'sys', text: 'Running…' });
  }

  function inject(html, token) {
    // single line, so line numbers in user errors still match the editor
    var tag = '<script>new Function("t",' + JSON.stringify('(' + bridge.toString() + ')(t)') + ')(' + JSON.stringify(token) + ')<\/script>', m;
    if ((m = /<head[^>]*>/i.exec(html))) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length);
    if ((m = /<html[^>]*>/i.exec(html))) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length);
    if ((m = /^\s*<!doctype[^>]*>/i.exec(html))) return html.slice(0, m[0].length) + tag + html.slice(m[0].length);
    return tag + html;
  }
  function buildDoc(note, token) {
    var t = note.text || '', head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    if (note.lang === 'js') {
      t = '<!doctype html><html><head>' + head + '<style>body{font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;margin:16px}</style></head><body><script>' + t.replace(/<\/script/gi, '<\\/script') + '\n<\/script></body></html>';
    } else if (note.lang === 'xml') {
      t = '<!doctype html><html><head>' + head + '<style>html,body{margin:0;height:100%}body{display:grid;place-items:center}svg{max-width:100%;max-height:100vh}</style></head><body>' + t + '</body></html>';
    }
    return inject(t, token);
  }

  /* ---------- UI ---------- */
  var P = {}, token = '', cur = null, getNote = null, open = false, unread = 0, devIdx = 0, errCount = 0;
  var DEVICES = [['Full', 0], ['Phone', 390], ['Tablet', 820]];
  var frame, conList, conPanel;

  function conAdd(level, text) {
    var row = document.createElement('div');
    row.className = 'cl l-' + level;
    if (S.settings.conTime) {
      var d = new Date(), tm = document.createElement('time');
      tm.textContent = d.toTimeString().slice(0, 8) + ' ';
      row.appendChild(tm);
    }
    var pre = document.createElement('span');
    pre.textContent = text;
    row.appendChild(pre);
    var atBottom = conList.scrollTop + conList.clientHeight >= conList.scrollHeight - 30;
    conList.appendChild(row);
    while (conList.childNodes.length > 1000) conList.removeChild(conList.firstChild);
    if (atBottom) conList.scrollTop = conList.scrollHeight;
    if (level === 'error' || level === 'warn') { errCount++; }
    if (level !== 'sys' && level !== 'cmd' && level !== 'result') { unread++; }
    badge();
    if (level === 'error' && S.settings.conAutoOpen && conPanel.hidden) conToggle(true);
  }
  function badge() {
    var b = $('pv-badge');
    b.textContent = errCount ? errCount : (unread > 99 ? '99+' : unread || '');
    b.className = 'badge' + (errCount ? ' err' : '');
    b.hidden = !(errCount || unread);
  }
  function conClear() { conList.innerHTML = ''; unread = 0; errCount = 0; badge(); }
  function conToggle(show, persist) {
    var v = show === undefined ? conPanel.hidden : show;
    conPanel.hidden = !v;
    $('pv-console').setAttribute('aria-pressed', v ? 'true' : 'false');
    $('pv').classList.toggle('con-open', v);
    if (v) { unread = 0; errCount = 0; badge(); conList.scrollTop = conList.scrollHeight; }
    if (persist) S.setting('conOpen', v);
  }
  function setConHeight(pct) {
    pct = Math.max(12, Math.min(80, pct));
    conPanel.style.height = pct + 'vh';
    S.setting('conHeight', Math.round(pct));
  }

  function run() {
    if (!cur) return;
    var note = getNote ? getNote() : cur;
    cur = note;
    $('pv-title').textContent = note.title || 'Preview';
    var isMd = note.mode === 'md' || note.lang === 'md' && note.mode === 'code';
    $('pv').classList.toggle('is-md', isMd);
    $('pv-md').hidden = !isMd;
    $('pv-stage').hidden = isMd;
    $('pv-console').hidden = isMd; $('pv-device').hidden = isMd;
    $('pv-newtab').hidden = isMd;
    if (isMd) {
      var box = $('pv-md');
      box.innerHTML = '<article class="md">' + renderMarkdown(note.text) + '</article>';
      return;
    }
    if (!S.settings.conKeep) conClear();
    token = Math.random().toString(36).slice(2);
    // brand-new iframe each run => clean global state, like a page reload
    var f = document.createElement('iframe');
    f.id = 'pv-frame'; f.title = 'Preview';
    f.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock allow-downloads');
    f.setAttribute('allow', 'fullscreen');
    if (frame && frame.parentNode) frame.parentNode.replaceChild(f, frame); else $('pv-stage').appendChild(f);
    frame = f;
    f.srcdoc = buildDoc(note, token);
  }

  function setDevice(i) {
    devIdx = i % DEVICES.length;
    var d = DEVICES[devIdx];
    $('pv-stage').style.setProperty('--w', d[1] ? d[1] + 'px' : '100%');
    $('pv-stage').classList.toggle('framed', !!d[1]);
    $('pv-device').title = 'Width: ' + d[0];
    $('pv-device').querySelector('span').textContent = d[1] ? d[1] : '';
  }

  P.init = function () {
    frame = $('pv-frame'); conList = $('pv-con-list'); conPanel = $('pv-con');
    $('pv-close').onclick = P.close;
    $('pv-reload').onclick = run;
    $('pv-console').onclick = function () { conToggle(undefined, true); };
    $('pv-device').onclick = function () { setDevice(devIdx + 1); };
    $('pv-con-clear').onclick = conClear;
    $('pv-newtab').onclick = function () {
      var note = getNote ? getNote() : cur;
      var blob = new Blob([buildDoc(note, 'x')], { type: 'text/html' });
      var w = global.open(URL.createObjectURL(blob), '_blank');
      if (!w) conAdd('warn', 'Pop-up blocked');
    };
    Array.prototype.forEach.call(document.querySelectorAll('#pv-filters button'), function (b) {
      b.onclick = function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        conList.classList.toggle('hide-' + b.getAttribute('data-l'), !on);
      };
    });
    $('pv-con-form').onsubmit = function (e) {
      e.preventDefault();
      var inp = $('pv-con-in'), code = inp.value.trim();
      if (!code || !frame || !frame.contentWindow) return;
      hist.push(code); hi = hist.length; inp.value = '';
      frame.contentWindow.postMessage({ jot: 'eval', token: token, code: code }, '*');
    };
    var hist = [], hi = 0;
    $('pv-con-in').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' && hist.length) { hi = Math.max(0, hi - 1); this.value = hist[hi]; e.preventDefault(); }
      else if (e.key === 'ArrowDown' && hist.length) { hi = Math.min(hist.length, hi + 1); this.value = hist[hi] || ''; e.preventDefault(); }
    });
    // drag handle to resize the console
    var h = $('pv-con-grip'), drag = false;
    h.addEventListener('pointerdown', function (e) { drag = true; h.setPointerCapture(e.pointerId); e.preventDefault(); });
    h.addEventListener('pointermove', function (e) { if (drag) setConHeight((1 - e.clientY / global.innerHeight) * 100); });
    h.addEventListener('pointerup', function () { drag = false; });
    h.addEventListener('pointercancel', function () { drag = false; });
    global.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.jot !== 1 || d.token !== token || !frame || e.source !== frame.contentWindow) return;
      if (d.clear) conClear(); else conAdd(d.level, d.text);
    });
    setDevice(0);
  };

  P.open = function (note, getter) {
    cur = note; getNote = getter; open = true;
    $('pv').hidden = false;
    document.documentElement.classList.add('pv-on');
    conPanel.style.height = (S.settings.conHeight || 38) + 'vh';
    conToggle(!!S.settings.conOpen);
    run();
  };
  P.close = function () {
    if (!open) return;
    open = false; $('pv').hidden = true;
    document.documentElement.classList.remove('pv-on');
    if (frame) frame.srcdoc = '<!doctype html>';           // stop timers / audio
    if (global.JotApp) global.JotApp.focus();
  };
  P.isOpen = function () { return open; };
  P.reload = run;
  P.toggleConsole = function () { conToggle(undefined, true); };
  P.renderMarkdown = renderMarkdown;
  P.standalone = function (note) {
    var css = 'body{font:16px/1.65 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#222}pre{background:#f4f4f4;padding:12px;overflow:auto;border-radius:6px}code{font-family:ui-monospace,Menlo,Consolas,monospace}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}blockquote{border-left:3px solid #ccc;margin:0;padding-left:1em;color:#555}img{max-width:100%}';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(note.title || 'Note') + '</title><style>' + css + '</style></head><body>' + renderMarkdown(note.text) + '</body></html>';
  };
  global.JotPreview = P;
})(window);
