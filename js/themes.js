/* Jot — themes. Generated table: id, name, dark, 18 colours:
   bg fg ui muted line accent sel kw str num com fn tag attr head link op type */
(function (global) {
  'use strict';
  var KEYS = ['bg', 'fg', 'ui', 'muted', 'line', 'accent', 'sel', 'kw', 'str', 'num', 'com', 'fn', 'tag', 'attr', 'head', 'link', 'op', 'type'];
  var RAW = [
    ["ember", "Ember", 1, "14100f ece3dc 1b1514 8a766d 2e2321 ff5a36 4a2a22 ff5f56 e6c07b ff9966 7d685f ffb454 ff6b5e e6a15c ff6a3d ff9b5e d98a6c f0883e"],
    ["paper", "Paper", 0, "fbf9f4 26241f f1ede3 8b8577 e2dccd c2410c f3dcb8 a21caf 15803d b45309 9a9484 1d4ed8 be123c b45309 c2410c 1d4ed8 57534e 0e7490"],
    ["solar-light", "Solarized Light", 0, "fdf6e3 586e75 eee8d5 93a1a1 e3dcc5 268bd2 e6dfc4 859900 2aa198 d33682 93a1a1 268bd2 268bd2 b58900 cb4b16 268bd2 657b83 b58900"],
    ["gruvbox-light", "Gruvbox Light", 0, "fbf1c7 3c3836 ebdbb2 928374 d5c4a1 af3a03 d5c4a1 9d0006 79740e 8f3f71 928374 076678 9d0006 b57614 af3a03 076678 7c6f64 b57614"],
    ["rose", "Rosé Dawn", 0, "faf4ed 575279 f2e9e1 9893a5 e4d9d0 b4637a dfdad9 286983 b3711a d7827e 9893a5 56949f b4637a d7827e b4637a 286983 797593 56949f"],
    ["mint", "Mint", 0, "f3faf6 1e3a2f e4f3ea 6f9483 cfe6d9 0f9d6c bfe8d3 0b7a5a b45309 7c3aed 7ea593 0369a1 be185d 0f766e 0f9d6c 0369a1 3f6b58 7c3aed"],
    ["github", "GitHub Light", 0, "ffffff 1f2328 f6f8fa 656d76 d0d7de 0969da b6e3ff cf222e 0a3069 0550ae 6e7781 8250df 116329 0550ae 0550ae 0969da 1f2328 953800"],
    ["midnight", "Midnight", 1, "0f1117 d6dae4 161923 6b7285 232736 6ea8fe 2a3b5c c792ea a5d6a7 f78c6c 5c6480 82aaff f07178 ffcb6b 6ea8fe 82aaff 89ddff ffcb6b"],
    ["dracula", "Dracula", 1, "282a36 f8f8f2 21222c 6272a4 343746 bd93f9 44475a ff79c6 f1fa8c bd93f9 6272a4 50fa7b ff79c6 50fa7b bd93f9 8be9fd ff79c6 8be9fd"],
    ["nord", "Nord", 1, "2e3440 d8dee9 272c36 7b88a1 3b4252 88c0d0 434c5e 81a1c1 a3be8c b48ead 616e88 88c0d0 81a1c1 8fbcbb 88c0d0 88c0d0 81a1c1 8fbcbb"],
    ["solar-dark", "Solarized Dark", 1, "002b36 93a1a1 00212b 586e75 0a3a46 2aa198 0d4452 859900 2aa198 d33682 586e75 268bd2 268bd2 b58900 cb4b16 268bd2 839496 b58900"],
    ["gruvbox-dark", "Gruvbox Dark", 1, "282828 ebdbb2 1d2021 928374 3c3836 fabd2f 504945 fb4934 b8bb26 d3869b 928374 83a598 fb4934 fabd2f fe8019 83a598 a89984 fabd2f"],
    ["monokai", "Monokai", 1, "272822 f8f8f2 1e1f1c 75715e 3a3b34 a6e22e 49483e f92672 e6db74 ae81ff 75715e a6e22e f92672 a6e22e fd971f 66d9ef f92672 66d9ef"],
    ["tokyo", "Tokyo Night", 1, "1a1b26 c0caf5 16161e 565f89 292e42 7aa2f7 33467c bb9af7 9ece6a ff9e64 565f89 7aa2f7 f7768e e0af68 7aa2f7 7dcfff 89ddff 2ac3de"],
    ["one-dark", "One Dark", 1, "282c34 abb2bf 21252b 636d83 333842 61afef 3e4451 c678dd 98c379 d19a66 5c6370 61afef e06c75 d19a66 e06c75 61afef 56b6c2 e5c07b"],
    ["ayu", "Ayu Mirage", 1, "1f2430 cccac2 1a1f29 707a8c 2d3342 ffcc66 33415e ffa759 d5ff80 dfbfff 6c7a8b ffd173 5ccfe6 ffd173 ffcc66 73d0ff f29e74 73d0ff"],
    ["mocha", "Catppuccin", 1, "1e1e2e cdd6f4 181825 7f849c 313244 cba6f7 45475a cba6f7 a6e3a1 fab387 6c7086 89b4fa f38ba8 f9e2af f5c2e7 89dceb 94e2d5 f9e2af"],
    ["everforest", "Everforest", 1, "2d353b d3c6aa 232a2e 859289 3d484d a7c080 475258 e67e80 a7c080 d699b6 859289 7fbbb3 e67e80 dbbc7f e69875 7fbbb3 e69875 dbbc7f"],
    ["ocean", "Oceanic", 1, "1b2b34 d8dee9 16232a 65737e 29404c 6699cc 343d46 c594c5 99c794 f99157 65737e 6699cc ec5f67 fac863 6699cc 5fb3b3 5fb3b3 fac863"],
    ["terminal", "Terminal", 1, "000a00 33ff66 001400 1f9940 003d14 33ff66 0a5c22 66ff99 b3ff66 99ffcc 1f9940 66ffcc 66ff99 99ff66 99ffbb 66ffcc 33cc55 66ffcc"],
    ["amber", "Amber CRT", 1, "1a1000 ffb000 130b00 8f6200 3a2500 ffb000 5a3a00 ffd060 ffc533 ff9a3c 8f6200 ffe0a0 ffd060 ffc533 ffd98a ffe0a0 cc8c00 ffd060"]
  ];
  var list = RAW.map(function (r) {
    var c = {}, p = r[3].split(' ');
    KEYS.forEach(function (k, i) { c[k] = '#' + p[i]; });
    return { id: r[0], name: r[1], dark: !!r[2], c: c };
  });
  function find(id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function auto() {
    var dark = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? 'ember' : 'paper';
  }
  function apply(id) {
    var t = find(id) || find(auto()), r = document.documentElement, k;
    for (k in t.c) r.style.setProperty('--' + (k === 'ui' ? 'ui-bg' : k), t.c[k]);
    r.setAttribute('data-theme', t.id);
    r.style.colorScheme = t.dark ? 'dark' : 'light';
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', t.c.ui);
    return t;
  }
  global.JotThemes = { list: list, find: find, apply: apply, auto: auto };
})(window);
