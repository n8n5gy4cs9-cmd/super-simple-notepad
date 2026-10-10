/* Dev-only end-to-end test (the app itself needs no Node). Needs Playwright:
 *   NODE_PATH=/path/to/node_modules node tests/browser-test.js
 * It copies the project to a temp dir and serves it with PHP's built-in server. */
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jot-'));
execSync(`cp -r "${root}/." "${tmp}/" && rm -rf "${tmp}/.git"`);
fs.writeFileSync(path.join(tmp, 'api/config.php'), `<?php return array('token'=>'tok123','data_dir'=>'${tmp}/data');`);
const PORT = 8123, URL = `http://127.0.0.1:${PORT}/`;
const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', tmp], { stdio: 'ignore' });

let failed = 0;
const ok = (name, cond, extra) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(extra))); if (!cond) failed++; };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

(async () => {
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URL); await p.waitForTimeout(500);
  const val = () => p.evaluate(() => JotApp.editor().getValue());

  // ---- start state
  eq('opens in plain mode', await p.evaluate(() => JotApp.mode()), 'plain');
  ok('textarea is focused', await p.evaluate(() => document.activeElement.id === 'plain'));
  ok('monospace font', /mono|Mono|monospace/i.test(await p.evaluate(() => getComputedStyle(document.getElementById('plain')).fontFamily)));
  eq('default theme is ember', await p.evaluate(() => document.documentElement.dataset.theme), 'ember');
  eq('20+ themes', await p.evaluate(() => JotThemes.list.length >= 20), true);

  // ---- typing + persistence
  await p.keyboard.type('foo bar foo\nline b\nline a\nfoo');
  await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(500);
  eq('text survives reload', await val(), 'foo bar foo\nline b\nline a\nfoo');

  // ---- find & replace
  await p.keyboard.press('Control+f');
  await p.fill('#f-q', 'foo');
  await p.waitForTimeout(100);
  eq('find counts matches', await p.textContent('#f-count'), '3');
  await p.keyboard.press('Enter');
  eq('Enter selects first match', await p.evaluate(() => JotApp.editor().sel()), { from: 0, to: 3 });
  await p.keyboard.press('Enter');
  eq('Enter selects next match', await p.evaluate(() => JotApp.editor().sel()), { from: 8, to: 11 });
  await p.click('#f-swap'); await p.fill('#f-r', 'X'); await p.click('#f-all'); await p.waitForTimeout(100);
  eq('replace all', await val(), 'X bar X\nline b\nline a\nX');
  await p.click('#f-re'); await p.fill('#f-q', 'line (\\w)'); await p.fill('#f-r', '[$1]'); await p.click('#f-all');
  eq('regex replace with groups', await val(), 'X bar X\n[b]\n[a]\nX');
  await p.click('#f-close');

  // ---- tools
  await p.evaluate(() => JotApp.editor().setValue('b\nc\na\nb'));
  await p.click('#b-more'); await p.click('text=Text tools'); await p.click('text=Sort lines A → Z'); await p.waitForTimeout(100);
  eq('sort lines', await val(), 'a\nb\nb\nc');
  await p.click('#b-more'); await p.click('text=Text tools'); await p.click('text=Remove duplicate lines');
  eq('unique lines', await val(), 'a\nb\nc');
  await p.evaluate(() => JotApp.editor().setValue('{"a":1,"b":[1,2]}'));
  await p.click('#b-more'); await p.click('text=Text tools'); await p.click('text=Format JSON');
  ok('format json', (await val()).includes('\n'), await val());

  // ---- modes keep the text
  await p.evaluate(() => JotApp.editor().setValue('# Hi\n\ntext'));
  await p.click('[data-m=md]'); eq('md keeps text', await val(), '# Hi\n\ntext');
  ok('md toolbar visible', await p.isVisible('#mdbar'));
  ok('CodeMirror tokenises markdown', await p.evaluate(() => !!document.querySelector('.cm-header')));
  await p.evaluate(() => { const e = JotApp.editor(); e.setSel(6, 10); });
  await p.click('#mdbar button[title^=Bold]');
  eq('bold button wraps selection', await val(), '# Hi\n\n**text**');
  await p.click('[data-m=code]'); await p.selectOption('#lang', 'js');
  await p.evaluate(() => JotApp.editor().setValue('const a = 1;'));
  ok('js highlighted', await p.evaluate(() => !!document.querySelector('.cm-keyword')));
  await p.click('[data-m=plain]'); eq('back to plain', await val(), 'const a = 1;');

  // ---- notes
  await p.keyboard.press('Alt+n'); await p.waitForTimeout(100);
  await p.keyboard.type('second note');
  await p.waitForTimeout(500);
  await p.click('#b-notes');
  eq('two notes listed', await p.$$eval('#n-list .ni', e => e.length), 2);
  await p.fill('#n-q', 'second'); eq('search filters', await p.$$eval('#n-list .ni', e => e.length), 1);
  await p.fill('#n-q', 'const'); eq('search looks inside text', await p.$$eval('#n-list .ni', e => e.length), 1);
  await p.fill('#n-q', '');
  await p.click('#n-list .ni .del >> nth=0'); await p.waitForTimeout(200);
  eq('delete removes note', await p.$$eval('#n-list .ni', e => e.length), 1);
  await p.keyboard.press('Escape');

  // ---- backup round trip
  const backup = await p.evaluate(() => JotStore.exportAll());
  eq('backup shape', [backup.app, Array.isArray(backup.notes)], ['jot', true]);
  await p.evaluate(b => { JotStore.wipe(); JotStore.merge(b.notes); }, backup);
  eq('restore works', await p.evaluate(() => JotStore.list().length), backup.notes.length);

  // ---- settings
  await p.keyboard.press('Control+,');
  await p.click('.sw[data-id=nord]');
  eq('theme switch applies', await p.evaluate(() => document.documentElement.dataset.theme), 'nord');
  await p.evaluate(() => { const r = document.querySelector('[data-s=size]'); r.value = 22; r.dispatchEvent(new Event('input')); });
  eq('font size applies', await p.evaluate(() => getComputedStyle(document.getElementById('plain')).fontSize), '22px');
  await p.keyboard.press('Escape');
  await p.reload(); await p.waitForTimeout(400);
  eq('settings persist', await p.evaluate(() => [document.documentElement.dataset.theme, JotStore.settings.size]), ['nord', 22]);

  // ---- html runner
  await p.evaluate(() => { JotApp.setMode('code'); document.getElementById('lang').value = 'html'; document.getElementById('lang').dispatchEvent(new Event('change')); JotApp.editor().setValue('<p id=a>x</p><script>console.log(1+1)</script>'); });
  await p.keyboard.press('Control+Enter'); await p.waitForTimeout(600);
  ok('preview opens fullscreen', await p.isVisible('#pv-frame'));
  await p.click('#pv-console');
  ok('console shows logs', (await p.$$eval('#pv-con-list .cl', e => e.map(x => x.textContent))).includes('2'));
  await p.click('#pv-console');
  ok('console can be hidden', !(await p.isVisible('#pv-con')));
  await p.keyboard.press('Escape');

  // ---- PWA: manifest, SW, update picks up changed files (network-first)
  const mf = await p.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
  eq('manifest standalone + icons', [mf.display, mf.icons.some(i => i.purpose === 'maskable'), mf.icons.some(i => i.sizes === '512x512')], ['standalone', true, true]);
  await p.reload(); await p.waitForTimeout(1200);
  ok('service worker controls page', await p.evaluate(() => !!navigator.serviceWorker.controller));
  fs.appendFileSync(path.join(tmp, 'js/langs.js'), '\nwindow.__marker = 42;\n');
  await p.reload(); await p.waitForTimeout(600);
  eq('edited JS is served fresh (no stale cache)', await p.evaluate(() => window.__marker), 42);
  fs.appendFileSync(path.join(tmp, 'css/app.css'), '\nbody{outline:7px solid rgb(1,2,3)}\n');
  await p.reload(); await p.waitForTimeout(600);
  eq('edited CSS is served fresh', await p.evaluate(() => getComputedStyle(document.body).outlineColor), 'rgb(1, 2, 3)');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(600);
  ok('works offline', await p.evaluate(() => !!window.JotApp));
  await ctx.setOffline(false);

  // ---- server sync from the UI
  await p.evaluate(() => { JotStore.setting('syncToken', 'tok123'); JotStore.setting('syncUrl', 'api/index.php'); });
  await p.reload(); await p.waitForTimeout(400);
  await p.keyboard.press('Control+,');
  await p.click('#s-test'); await p.waitForTimeout(500);
  ok('sync test connects', /Connected/.test(await p.textContent('#s-syncmsg')), await p.textContent('#s-syncmsg'));
  await p.click('#s-sync'); await p.waitForTimeout(700);
  ok('sync completes', /Synced/.test(await p.textContent('#s-syncmsg')), await p.textContent('#s-syncmsg'));
  ok('server file written', fs.existsSync(path.join(tmp, 'data/notes.json')));
  await p.evaluate(() => JotStore.setting('syncToken', 'wrong'));
  await p.click('#s-test'); await p.waitForTimeout(1500);
  ok('bad token reported', /Bad token/.test(await p.textContent('#s-syncmsg')), await p.textContent('#s-syncmsg'));

  // ---- mobile viewport
  const m = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
  const mp = await m.newPage(); mp.on('pageerror', e => errs.push('mobile: ' + e.message));
  await mp.goto(URL); await mp.waitForTimeout(500);
  ok('no horizontal overflow', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const sizes = await mp.$$eval('#bar button, #modes button, #status select', e => e.filter(x => x.offsetParent).map(x => Math.round(x.getBoundingClientRect().height)));
  ok('touch targets >= 24px', sizes.every(h => h >= 24), sizes);
  ok('bar buttons >= 36px', (await mp.$$eval('#bar button', e => e.filter(x => x.offsetParent).map(x => x.getBoundingClientRect().width))).every(w => w >= 34));
  ok('textarea font >= 16px (no iOS zoom)', await mp.evaluate(() => parseFloat(getComputedStyle(document.getElementById('plain')).fontSize) >= 16));
  await mp.tap('#b-more'); await mp.waitForTimeout(400); ok('menu is a bottom sheet', await mp.evaluate(() => { const r = document.getElementById('menu').getBoundingClientRect(); return Math.abs(r.bottom - innerHeight) < 2; }));

  ok('no page errors', errs.length === 0, errs);
  await browser.close(); php.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); php.kill(); process.exit(1); });
