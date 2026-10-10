import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('KonDate title, header wordmark and installed app name match',()=>{
 const html=read('index.html'),manifest=JSON.parse(read('manifest.webmanifest'));
 assert.match(html,/<title>KonDate<\/title>/);
 assert.match(html,/apple-mobile-web-app-title" content="KonDate"/);
 assert.match(html,/class="brand-logo" src="\.\/icons\/kondate-logo\.svg" alt="KonDate"/);
 assert.equal(manifest.name,'KonDate');
 assert.equal(manifest.short_name,'KonDate');
 assert.ok(manifest.icons.every(icon=>icon.src.endsWith('?v=1.3.63')));
 assert.match(manifest.description,/献立.*予定/);
 assert.match(html,/rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png\?v=1\.3\.63"/);
 assert.match(html,/rel="icon" href="\.\/icons\/icon\.svg\?v=1\.3\.63"/);
});
test('header and home logo vectors are valid and retain the selected two colors',()=>{
 const header=read('icons/kondate-logo.svg'),icon=read('icons/icon.svg');
 for(const svg of [header,icon]){
  assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg,/#F58A4F/);
  assert.match(svg,/#5D7D55/);
  assert.match(svg,/<path /);
  assert.match(svg,/<\/svg>$/);
 }
});
test('PWA raster icons have the correct sizes and PNG signatures',()=>{
 for(const [path,size] of [['icons/icon-192.png',192],['icons/icon-512.png',512],['icons/apple-touch-icon.png',180]]){
  const b=readFileSync(new URL('../'+path,import.meta.url));
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16),size);
  assert.equal(b.readUInt32BE(20),size);
 }
});
test('calendar selector uses user-provided SVG with no numbered filename suffix',()=>{
 const app=read('src/app.js'),css=read('style.css'),svg=read('icons/calendar-check.svg'),sw=read('sw.js');
 assert.match(app,/calendar-switch-symbol/);
 assert.match(css,/mask:url\('\.\/icons\/calendar-check\.svg'\)/);
 assert.match(svg,/lucide-calendar-check/);
 assert.match(svg,/<path d="m9 15 2 2 4-4"\/>/);
 assert.doesNotMatch(sw,/calendar-check\(1\)/);
 for(const name of ['kondate-logo.svg','calendar-check.svg','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png']){
  assert.ok(sw.includes("'./icons/"+name+"'"),name);
 }
});

test('SVG home icon content is shifted toward the optical center',()=>{
 const svg=read('icons/icon.svg'),cache=read('sw.js');
 assert.match(svg,/transform="translate\(-5\.25 -24\.25\)"/);
 assert.match(cache,/kondate-shell-v1-3-65/);
});

test('KonDate is used consistently in app-facing copy, documentation and release header',()=>{
 const readme=read('README.md'),app=read('src/app.js'),workflow=read('.github/workflows/pages.yml');
 assert.match(readme,/^# KonDate\b/);
 assert.doesNotMatch(readme,/献立ノート/);
 assert.match(app,/KonDateの設定ファイルではありません。/);
 assert.doesNotMatch(app,/献立ノート/);
 assert.match(workflow,/name: `KonDate \$\{tag\}`/);
 assert.match(workflow,/`## KonDate \$\{tag\}`/);
});
