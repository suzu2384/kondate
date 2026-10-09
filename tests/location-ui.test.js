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
