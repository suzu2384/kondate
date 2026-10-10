import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const model=readFileSync(new URL('../src/model.js',import.meta.url),'utf8');

test('month calendar has no redundant view/history/master toolbar, with master editing accessible from generator',()=>{
 const calendar=app.slice(app.indexOf('function calendarScreen()'),app.indexOf('function dayContent('));
 assert.match(calendar,/screen calendar-screen/);
 assert.match(calendar,/month-grid/);
 assert.doesNotMatch(calendar,/view-history|view-month|calendar-toolbar|料理マスター|履歴一覧/);
 assert.match(app,/button\('料理マスター','master'/);
 assert.doesNotMatch(app,/view==='month'|view!=='month'|view-history/);
 assert.match(css,/\.calendar-screen \.calendar-layout\{flex:1/);
});
test('day chips have no leading bullet and clip overflow rather than adding an ellipsis',()=>{
 assert.match(css,/\.month-grid \.event-chip::before\{content:none;display:none\}/);
 assert.match(css,/\.month-grid \.event-chip\{white-space:nowrap;overflow:hidden;text-overflow:clip/);
});
test('record editor no longer offers a planned calendar event type',()=>{
 const editor=app.slice(app.indexOf('function drawRecord()'),app.indexOf('async function saveRecord()'));
 assert.doesNotMatch(editor,/record-status|献立案/);
 assert.match(app,/editor\.status='actual'/);
 assert.doesNotMatch(model,/record\.status==='plan'/);
 assert.match(model,/p\.state==='plan'\)return null/);
});
test('place input uses limited online search, attribution, native free-text and tap-to-select',()=>{
 assert.match(app,/id="record-location"/);
 assert.match(app,/id="place-suggestions"/);
 assert.match(app,/id="place-popup"/);
 assert.match(app,/searchPlaces\(query,/);
 assert.match(app,/pickPlaceSuggestion\(locationChoice\)/);
 assert.match(app,/field\.value=name;editor\.location=name/);
 assert.match(app,/Array\.from\(query\)\.length<2/);
 assert.doesNotMatch(app,/data-action="search-place"/);
 assert.match(app,/function queuePlaceLookup\(/);
 assert.match(app,/searchPlaces\(query,/);
 assert.match(app,/openstreetmap\.org\/copyright/);
});
test('the modified app parses as JavaScript',()=>{
 const result=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
