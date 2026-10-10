/* Jot — storage layer. localStorage is the source of truth. */
(function (global) {
  'use strict';
  var P = 'jot:v1:';
  var DEFAULTS = {
    theme: 'ember', font: 'jetbrains', size: 16, lineHeight: 1.6, measure: 0,
    wrap: true, lineNumbers: true, fold: true, activeLine: true, tabSize: 2,
    tabs: false, brackets: true, spell: false, pastEnd: true,
    keys: 'auto', startWith: 'last', newMode: 'plain',
    conTime: false, conKeep: false, conAutoOpen: true, conHeight: 38,
    syncUrl: 'api/index.php', syncToken: '', syncAuto: false
  };
  var mem = {};
  var ok = true;

  function get(k) {
    try { var v = localStorage.getItem(P + k); return v === null ? null : v; }
    catch (e) { ok = false; return mem[k] === undefined ? null : mem[k]; }
  }
  function set(k, v) {
    try { localStorage.setItem(P + k, v); delete mem[k]; return true; }
    catch (e) { mem[k] = v; ok = false; return false; }
  }
  function del(k) { try { localStorage.removeItem(P + k); } catch (e) {} delete mem[k]; }
  function jget(k, d) { var v = get(k); if (v === null) return d; try { return JSON.parse(v); } catch (e) { return d; } }

  var settings = (function () {
    var s = jget('settings', {}), o = {}, k;
    for (k in DEFAULTS) o[k] = (k in s) ? s[k] : DEFAULTS[k];
    return o;
  })();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var index = jget('index', []);       // [{id,title,mode,lang,updated,created,pinned,size}]
  var tomb = jget('tomb', {});         // deleted id -> timestamp (for sync)

  function saveIndex() { return set('index', JSON.stringify(index)); }
  function metaOf(n) {
    return { id: n.id, title: n.title || '', mode: n.mode, lang: n.lang, created: n.created,
      updated: n.updated, pinned: !!n.pinned, size: (n.text || '').length,
      snip: ((n.text || '').match(/\S[^\n]{0,80}/) || [''])[0].trim().slice(0, 60) };
  }

  var Store = {
    persistent: function () { return ok; },
    settings: settings,
    defaults: DEFAULTS,
    setting: function (k, v) {
      settings[k] = v; set('settings', JSON.stringify(settings));
    },
    resetSettings: function () {
      for (var k in DEFAULTS) settings[k] = DEFAULTS[k];
      del('settings');
    },
    uid: uid,
    reload: function () { index = jget('index', []); tomb = jget('tomb', {}); },
    list: function () { return index.slice(); },
    meta: function (id) { for (var i = 0; i < index.length; i++) if (index[i].id === id) return index[i]; return null; },
    get: function (id) { return jget('n:' + id, null); },
    /** Save a note (full object). Returns false when storage is full. */
    put: function (n) {
      var m = metaOf(n), found = false, i;
      var r = set('n:' + n.id, JSON.stringify(n));
      for (i = 0; i < index.length; i++) if (index[i].id === n.id) { index[i] = m; found = true; break; }
      if (!found) index.push(m);
      delete tomb[n.id];
      return saveIndex() && r;
    },
    remove: function (id) {
      del('n:' + id);
      index = index.filter(function (m) { return m.id !== id; });
      tomb[id] = Date.now();
      set('tomb', JSON.stringify(tomb));
      saveIndex();
      if (Store.current() === id) del('current');
    },
    tombs: function () { return tomb; },
    current: function () { return get('current'); },
    setCurrent: function (id) { set('current', id); },
    create: function (o) {
      var t = Date.now();
      var n = { id: uid(), title: '', text: '', mode: settings.newMode || 'plain', lang: 'html',
        created: t, updated: t, pinned: false };
      for (var k in o) n[k] = o[k];
      Store.put(n); return n;
    },
    exportAll: function () {
      return { app: 'jot', version: 1, exported: new Date().toISOString(), settings: settings,
        notes: index.map(function (m) { return Store.get(m.id); }).filter(Boolean) };
    },
    /** Merge notes from a backup / server. Newer 'updated' wins. Returns count changed. */
    merge: function (notes) {
      var c = 0;
      (notes || []).forEach(function (n) {
        if (!n || !n.id) return;
        var m = Store.meta(n.id);
        if (n.deleted) {
          if (m && m.updated < n.updated) { Store.remove(n.id); tomb[n.id] = n.updated; c++; }
          return;
        }
        if (tomb[n.id] && tomb[n.id] >= (n.updated || 0)) return;
        if (!m || m.updated < n.updated) { Store.put(n); c++; }
      });
      set('tomb', JSON.stringify(tomb));
      return c;
    },
    wipe: function () {
      try {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf(P) === 0) localStorage.removeItem(k); });
      } catch (e) {}
      mem = {}; index = []; tomb = {};
    },
    bytes: function () {
      var t = 0;
      try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(P) === 0) t += k.length + localStorage.getItem(k).length; }); } catch (e) {}
      return t * 2;
    }
  };
  global.JotStore = Store;
})(window);
