/* Jot — language table: id, label, CodeMirror mode spec, file extension(s), aliases for md fences. */
(function (global) {
  'use strict';
  var L = [
    ['html', 'HTML', 'htmlmixed', 'html', 'htm'],
    ['js', 'JavaScript', 'javascript', 'js', 'javascript mjs'],
    ['ts', 'TypeScript', 'text/typescript', 'ts', 'typescript'],
    ['json', 'JSON', { name: 'javascript', json: true }, 'json', 'jsonc'],
    ['css', 'CSS', 'css', 'css', ''],
    ['php', 'PHP', 'application/x-httpd-php', 'php', ''],
    ['py', 'Python', 'python', 'py', 'python'],
    ['sql', 'SQL', 'text/x-sql', 'sql', ''],
    ['xml', 'XML / SVG', 'xml', 'xml', 'svg'],
    ['sh', 'Shell', 'shell', 'sh', 'bash zsh shell'],
    ['yaml', 'YAML', 'yaml', 'yml', 'yaml'],
    ['md', 'Markdown', 'gfm', 'md', 'markdown'],
    ['c', 'C', 'text/x-csrc', 'c', 'h'],
    ['cpp', 'C++', 'text/x-c++src', 'cpp', 'c++ cc hpp'],
    ['cs', 'C#', 'text/x-csharp', 'cs', 'csharp'],
    ['java', 'Java', 'text/x-java', 'java', ''],
    ['kt', 'Kotlin', 'text/x-kotlin', 'kt', 'kotlin'],
    ['go', 'Go', 'go', 'go', 'golang'],
    ['rs', 'Rust', 'rust', 'rs', 'rust'],
    ['rb', 'Ruby', 'ruby', 'rb', 'ruby'],
    ['toml', 'TOML', 'toml', 'toml', ''],
    ['ini', 'INI / .env', 'text/x-properties', 'ini', 'properties env conf'],
    ['docker', 'Dockerfile', 'dockerfile', 'dockerfile', 'dockerfile'],
    ['diff', 'Diff', 'diff', 'diff', 'patch']
  ].map(function (r) { return { id: r[0], label: r[1], mode: r[2], ext: r[3], alias: (r[0] + ' ' + r[4]).trim().split(' ') }; });

  function byId(id) { for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  function byExt(ext) {
    ext = (ext || '').toLowerCase();
    for (var i = 0; i < L.length; i++) {
      if (L[i].ext === ext || L[i].alias.indexOf(ext) !== -1) return L[i];
    }
    return null;
  }
  global.JotLangs = {
    list: L, byId: byId, byExt: byExt,
    /** languages that can be run / previewed */
    runnable: function (id) { return id === 'html' || id === 'js' || id === 'xml' || id === 'md'; }
  };
})(window);
