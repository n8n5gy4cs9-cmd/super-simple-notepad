/* Jot — optional server sync (api/index.php). Local data always stays the source of truth. */
(function (global) {
  'use strict';
  var S = global.JotStore, busy = false, timer = 0;

  function call(action, body) {
    var url = S.settings.syncUrl || 'api/index.php';
    return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'a=' + action, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Jot-Token': S.settings.syncToken || '' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { throw new Error('Server returned ' + r.status + ' (not JSON — is PHP running?)'); })
        .then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; });
    });
  }

  var Sync = {
    configured: function () { return !!S.settings.syncToken; },
    test: function () { return call('ping'); },
    /** Push everything, merge what the server has. Resolves {changed}. */
    run: function () {
      if (busy) return Promise.reject(new Error('Sync already running'));
      busy = true;
      var notes = S.list().map(function (m) { return S.get(m.id); }).filter(Boolean);
      return call('sync', { notes: notes, tombs: S.tombs() }).then(function (j) {
        var incoming = j.notes.slice();
        Object.keys(j.tombs || {}).forEach(function (id) { incoming.push({ id: id, deleted: true, updated: j.tombs[id] }); });
        var changed = S.merge(incoming);
        S.setting('lastSync', Date.now());
        busy = false;
        return { changed: changed };
      }, function (e) { busy = false; throw e; });
    },
    /** Debounced background sync after edits (only when enabled). */
    later: function (cb) {
      if (!S.settings.syncAuto || !Sync.configured()) return;
      clearTimeout(timer);
      timer = setTimeout(function () { Sync.run().then(cb, function () {}); }, 4000);
    }
  };
  global.JotSync = Sync;
})(window);
