/* Jot — editor adapters. Plain = <textarea>; Markdown/Code = CodeMirror 5.
 * Both expose the same small API so tools, find and the status bar don't care which is active. */
(function (global) {
  'use strict';

  function raf(fn) { return (global.requestAnimationFrame || setTimeout)(fn); }

  /* ---------- plain textarea ---------- */
  function Plain(ta) {
    var self = this, changeCb = function () {}, curCb = function () {}, pend = false;
    this.kind = 'plain';
    this.el = ta;
    this.tabStr = '  ';
    this.tabsEnabled = true;

    function cursorSoon() {
      if (pend) return; pend = true;
      raf(function () { pend = false; curCb(); });
    }
    ta.addEventListener('input', function () { changeCb(); cursorSoon(); });
    ['keyup', 'click', 'focus'].forEach(function (ev) { ta.addEventListener(ev, cursorSoon); });
    document.addEventListener('selectionchange', function () { if (document.activeElement === ta) cursorSoon(); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && self.tabsEnabled) {
        e.preventDefault();
        var s = ta.selectionStart, t = ta.selectionEnd, v = ta.value;
        if (s !== t && v.slice(s, t).indexOf('\n') !== -1) {          // multi-line (un)indent
          var ls = v.lastIndexOf('\n', s - 1) + 1, block = v.slice(ls, t), out;
          if (e.shiftKey) out = block.replace(new RegExp('^(\\t|' + self.tabStr + '| {1,' + self.tabStr.length + '})', 'gm'), '');
          else out = block.replace(/^/gm, self.tabStr);
          self.replaceRange(ls, t, out); self.setSel(ls, ls + out.length);
        } else if (!e.shiftKey) self.insert(self.tabStr);
      }
    });

    this.onChange = function (f) { changeCb = f; };
    this.onCursor = function (f) { curCb = f; };
    this.getValue = function () { return ta.value; };
    this.setValue = function (t) { ta.value = t; ta.scrollTop = 0; ta.setSelectionRange(0, 0); };
    this.focus = function () { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } };
    this.sel = function () { return { from: ta.selectionStart, to: ta.selectionEnd }; };
    this.setSel = function (a, b) { ta.setSelectionRange(a, b === undefined ? a : b); };
    var mirror;
    /** Scroll so that char offset `pos` is visible, WITHOUT focusing (keeps the find box focused). */
    this.reveal = function () {
      var pos = ta.selectionStart, cs = getComputedStyle(ta);
      mirror = mirror || document.createElement('div');
      ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'whiteSpace', 'overflowWrap',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(function (k) { mirror.style[k] = cs[k]; });
      mirror.style.cssText += ';position:absolute;visibility:hidden;left:-9999px;top:0;box-sizing:border-box;width:' + ta.clientWidth + 'px;';
      mirror.textContent = ta.value.slice(0, pos) + '\u200b';
      document.body.appendChild(mirror);
      var y = mirror.scrollHeight - parseFloat(cs.paddingBottom);
      document.body.removeChild(mirror);
      var lh = parseFloat(cs.lineHeight) || 24;
      if (y - lh < ta.scrollTop + lh || y > ta.scrollTop + ta.clientHeight - lh * 1.5) ta.scrollTop = Math.max(0, y - ta.clientHeight / 3);
    };
    this.replaceRange = function (from, to, text) {
      this.focus(); ta.setSelectionRange(from, to);
      var ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e) {}
      if (!ok || ta.value.slice(from, from + text.length) !== text) {
        ta.setRangeText(text, from, to, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    this.insert = function (text) { var s = this.sel(); this.replaceRange(s.from, s.to, text); };
    this.undo = function () { this.focus(); document.execCommand('undo'); };
    this.redo = function () { this.focus(); document.execCommand('redo'); };
    this.cursor = function () {
      var p = ta.selectionStart, v = ta.value, before = v.slice(0, p);
      var ln = before.split('\n').length;
      return { line: ln, col: p - before.lastIndexOf('\n') };
    };
    this.goto = function (line) {
      var v = ta.value, idx = 0, n = Math.max(1, line | 0);
      while (--n > 0) { idx = v.indexOf('\n', idx) + 1; if (idx === 0) { idx = v.length; break; } }
      this.setSel(idx, idx); this.reveal(); this.focus();
    };
    this.lineCount = function () { return ta.value.split('\n').length; };
    this.move = function (dx, dy) {                       // cursor keys for the on-screen key row
      var s = ta.selectionStart, v = ta.value;
      if (dy) {
        var ls = v.lastIndexOf('\n', s - 1) + 1, col = s - ls, p;
        if (dy < 0) { if (!ls) return; var ps = v.lastIndexOf('\n', ls - 2) + 1; p = Math.min(ps + col, ls - 1); }
        else { var le = v.indexOf('\n', s); if (le < 0) return; var ne = v.indexOf('\n', le + 1); if (ne < 0) ne = v.length; p = Math.min(le + 1 + col, ne); }
        this.setSel(p);
      } else this.setSel(Math.max(0, Math.min(v.length, s + dx)));
    };
    this.show = function () { ta.hidden = false; };
    this.hide = function () { ta.hidden = true; };
    this.apply = function (st) {
      ta.style.whiteSpace = st.wrap ? 'pre-wrap' : 'pre';
      ta.style.overflowWrap = st.wrap ? 'anywhere' : 'normal';
      ta.spellcheck = !!st.spell;
      ta.style.tabSize = st.tabSize;
      this.tabStr = st.tabs ? '\t' : new Array(st.tabSize + 1).join(' ');
    };
    this.refresh = function () {};
  }

  /* ---------- CodeMirror ---------- */
  function Code(host) {
    var self = this, changeCb = function () {}, curCb = function () {};
    var CM = global.CodeMirror;
    this.kind = 'code';
    var cm = this.cm = CM(host, {
      value: '', theme: 'syn', lineNumbers: true, lineWrapping: true, styleActiveLine: true,
      matchBrackets: true, autoCloseBrackets: true, autoCloseTags: true, foldGutter: true, indentUnit: 2, tabSize: 2,
      indentWithTabs: false, smartIndent: true, electricChars: true, viewportMargin: 20,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      inputStyle: 'contenteditable', spellcheck: false, autocorrect: false, autocapitalize: false,
      extraKeys: {
        Tab: function (c) { if (c.somethingSelected()) c.indentSelection('add'); else c.replaceSelection(c.getOption('indentWithTabs') ? '\t' : new Array(c.getOption('indentUnit') + 1).join(' '), 'end'); },
        'Shift-Tab': function (c) { c.indentSelection('subtract'); },
        Enter: function (c) {
          if (c.getOption('mode') && (c.getOption('mode').name === 'gfm' || c.getOption('mode') === 'gfm')) c.execCommand('newlineAndIndentContinueMarkdownList');
          else c.execCommand('newlineAndIndent');
        },
        'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
        'Ctrl-D': function (c) { var l = c.getCursor().line, t = c.getLine(l); c.replaceRange('\n' + t, { line: l, ch: t.length }); },
        'Alt-Up': function (c) { moveLine(c, -1); }, 'Alt-Down': function (c) { moveLine(c, 1); }
      }
    });
    function moveLine(c, d) {
      var l = c.getCursor().line, o = l + d;
      if (o < 0 || o >= c.lineCount()) return;
      var a = c.getLine(l), b = c.getLine(o);
      c.operation(function () { c.replaceRange(b, { line: l, ch: 0 }, { line: l, ch: a.length }); c.replaceRange(a, { line: o, ch: 0 }, { line: o, ch: b.length }); c.setCursor({ line: o, ch: c.getCursor().ch }); });
    }
    cm.on('change', function () { changeCb(); });
    cm.on('cursorActivity', function () { curCb(); });
    cm.getWrapperElement().setAttribute('spellcheck', 'false');

    this.el = cm.getWrapperElement();
    this.onChange = function (f) { changeCb = f; };
    this.onCursor = function (f) { curCb = f; };
    this.getValue = function () { return cm.getValue(); };
    this.setValue = function (t) { cm.setValue(t); cm.clearHistory(); cm.setCursor(0, 0); cm.scrollTo(0, 0); };
    this.focus = function () { cm.focus(); };
    this.sel = function () { var d = cm.getDoc(); return { from: d.indexFromPos(d.getCursor('from')), to: d.indexFromPos(d.getCursor('to')) }; };
    this.setSel = function (a, b) { var d = cm.getDoc(); d.setSelection(d.posFromIndex(a), d.posFromIndex(b === undefined ? a : b)); };
    this.reveal = function () { cm.scrollIntoView(null, 80); };
    this.replaceRange = function (from, to, text) { var d = cm.getDoc(); d.replaceRange(text, d.posFromIndex(from), d.posFromIndex(to)); };
    this.insert = function (text) { cm.replaceSelection(text, 'end'); cm.focus(); };
    this.undo = function () { cm.undo(); cm.focus(); };
    this.redo = function () { cm.redo(); cm.focus(); };
    this.cursor = function () { var c = cm.getCursor(); return { line: c.line + 1, col: c.ch + 1 }; };
    this.goto = function (line) { var l = Math.max(0, Math.min(cm.lineCount() - 1, (line | 0) - 1)); cm.setCursor({ line: l, ch: 0 }); cm.scrollIntoView(null, 120); cm.focus(); };
    this.lineCount = function () { return cm.lineCount(); };
    this.move = function (dx, dy) { cm.execCommand(dy ? (dy < 0 ? 'goLineUp' : 'goLineDown') : (dx < 0 ? 'goCharLeft' : 'goCharRight')); };
    this.show = function () { this.el.style.display = ''; cm.refresh(); };
    this.hide = function () { this.el.style.display = 'none'; };
    this.setMode = function (spec) { cm.setOption('mode', spec); };
    this.apply = function (st) {
      cm.setOption('lineNumbers', !!st.lineNumbers);
      cm.setOption('lineWrapping', !!st.wrap);
      cm.setOption('styleActiveLine', !!st.activeLine);
      cm.setOption('autoCloseBrackets', !!st.brackets);
      cm.setOption('tabSize', st.tabSize);
      cm.setOption('indentUnit', st.tabSize);
      cm.setOption('indentWithTabs', !!st.tabs);
      cm.setOption('foldGutter', !!st.fold);
      cm.setOption('gutters', st.fold ? ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'] : ['CodeMirror-linenumbers']);
      cm.refresh();
    };
    this.refresh = function () { cm.refresh(); };
    this.comment = function () { cm.execCommand('toggleComment'); };
    this.fold = function (all) { cm.operation(function () { for (var i = 0; i < cm.lineCount(); i++) cm.foldCode({ line: i, ch: 0 }, null, all ? 'fold' : 'unfold'); }); };
  }

  global.JotEditors = { Plain: Plain, Code: Code };
})(window);
