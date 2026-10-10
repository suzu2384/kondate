import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('record registration and editing show an optional Google Calendar location input',()=>{
 const draw=app.slice(app.indexOf('function openRecord('),app.indexOf('async function saveRecord()'));
 assert.match(draw,/id="record-location"/);
 assert.match(draw,/value="\$\{esc\(editor\.location\|\|''\)\}"/);
 assert.match(draw,/外食/);
 assert.match(draw,/editor\.location\?\?=editor\.raw\?\.location/);
});
test('location changes persist in editor without blur and are included on save',()=>{
 assert.match(app,/if\(editor&&el\.id==='record-location'\)\{editor\.location=el\.value;queuePlaceLookup\(el\);\}/);
 assert.match(app,/if\(el\.id==='record-location'\)editor\.location=el\.value/);
 assert.match(app,/current\.location=String\(current\.location\|\|''\)\.trim\(\)/);
 assert.match(app,/外食・場所：\$\{esc\(r\.location\)\}/);
});
test('browser app remains valid JavaScript',()=>{
 const result=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('one-field location typeahead is region-neutral and keeps candidates inline',()=>{
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const dialog=app.slice(app.indexOf('function drawRecord(){'),app.indexOf('async function saveRecord()'));
 assert.doesNotMatch(dialog,/id="place-search-area"/);
 assert.doesNotMatch(dialog,/data-action="search-place"/);
 assert.match(dialog,/「店名 地域名」/);
 assert.match(dialog,/入力すると候補が自動で表示/);
 assert.match(dialog,/id="place-search-status"/);
 assert.doesNotMatch(dialog,/placeholder="津田沼"/);
 assert.match(app,/function queuePlaceLookup\(field,\{immediate=false\}=\{\}\)/);
 assert.match(app,/const delay=Math\.max\(immediate\?0:650,1000-/);
 assert.match(css,/#dialog-content #place-popup\{\s*position:fixed/);
 assert.match(css,/#dialog-content #place-suggestions\{[\s\S]*?touch-action:pan-y/);
 assert.match(css,/\.place-field \.place-suggestion small\{[^}]*white-space:normal/);
});

test('place suggestions are portaled outside the scrolling form and selected only on click',()=>{
 const dialog=app.slice(app.indexOf('function drawRecord(){'),app.indexOf('async function saveRecord()'));
 const gestures=app.slice(app.indexOf("document.addEventListener('pointerdown',e=>"),app.indexOf("document.addEventListener('pointermove',e=>"));
 assert.match(dialog,/id="place-popup"/);
 assert.match(dialog,/\$\('#dialog-content'\)\.appendChild\(popup\)/);
 assert.match(app,/function positionPlaceSuggestions\(\)/);
 assert.match(app,/globalThis\.visualViewport\?\.addEventListener\('resize',positionPlaceSuggestions\)/);
 assert.doesNotMatch(gestures,/pickPlaceSuggestion\(/);
 assert.match(app,/'pick-location':pickPlaceSuggestion/);
});
