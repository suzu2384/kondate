import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=file('src/app.js'),css=file('style.css'),worker=file('sw.js');
const styles=css.slice(css.lastIndexOf('/* v1.14.30 —'));
const actionPath='icons/actions/';

test('four supplied SVG icons are in the actions directory, not in user presets',()=>{
 const expected=[
  ['users-round.svg','lucide-users-round','M18 21a8 8 0 0 0-16 0'],
  ['user-round-plus.svg','lucide-user-round-plus','M19 16v6'],
  ['copy.svg','lucide-copy','x="8" y="8"'],
  ['link-2.svg','lucide-link-2','M9 17H7']
 ];
 for(const [name,cls,fragment] of expected){
  const svg=file(actionPath+name);
  assert.match(svg,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.includes(cls),name+' icon class');
  assert.ok(svg.includes(fragment),name+' icon geometry');
  assert.ok(worker.includes("'./icons/actions/"+name+"'"),name+' precached for PWA offline');
 }
});

test('menu, recipe and shopping share buttons all show users-round.svg',()=>{
 assert.ok(styles.length>650,'Latest CSS icon block exists');
 for(const panel of ['generation-controls','master-toolbar','shopping-toolbar']){
  assert.ok(styles.includes('.'+panel+' .family-share-button'),panel);
 }
 assert.match(styles,/\.family-share-button::before\{[\s\S]*?users-round\.svg/);
 assert.match(styles,/font-size:0;/,'Remove visible label but retain semantic button text');
 assert.match(app,/button\('共有','family-dialog','family-share-button mini generation-share-button','data-kind="plan"'/);
 assert.match(app,/button\('共有','family-dialog','family-share-button mini', 'data-kind="master"'/);
 assert.match(app,/button\('共有','family-dialog','family-share-button mini','data-kind="shopping"'/);
});

test('dialog buttons use invite, copy and link SVGs based on existing action IDs',()=>{
 assert.match(styles,/#dialog \.family-email-row \[data-action="family-start"\]::before\{[\s\S]*?user-round-plus\.svg/);
 assert.match(styles,/#dialog \.family-link-row #family-url-action\[data-action="family-copy-link"\]::before\{[\s\S]*?copy\.svg/);
 assert.match(styles,/#dialog \.family-link-row #family-url-action\[data-action="family-join"\]::before\{[\s\S]*?link-2\.svg/);
 assert.match(app,/action\.dataset\.action=same\?'family-copy-link':'family-join'/);
 assert.match(app,/action\.textContent=same\?'コピー':'参加'/);
 assert.match(app,/action\.title=same\?'共有URLをコピー':'共有URLに参加'/);
 assert.match(app,/start\.title=d\.owner&&linked\?'共有相手を追加':'メールアドレスで共有'/);
});

test('icons respect theme colour and remain tappable on iPhone',()=>{
 assert.match(styles,/background-color:currentColor;/);
 assert.match(styles,/-webkit-mask-image:url\('\.\/icons\/actions\/users-round\.svg'\)/);
 assert.match(styles,/display:inline-flex;/);
 assert.match(styles,/#dialog \.family-link-row #family-url-action\{[\s\S]*?min-width:38px;/);
 assert.match(styles,/@media\(max-width:760px\)\{[\s\S]*?flex-basis:34px;width:34px;min-width:34px/);
 assert.ok(!styles.includes('display:none'));
});
