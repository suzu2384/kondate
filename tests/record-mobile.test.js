import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('record input provides a native-independent, selectable dish suggestion list',()=>{
 const block=app.slice(app.indexOf('function dishRows('),app.indexOf('function openRecord('));
 assert.match(block,/aria-autocomplete="list"/);
 assert.match(block,/dish-suggestions/);
 assert.doesNotMatch(block,/list="dish-options"/);
 assert.match(app,/function showDishSuggestions\(input\)/);
 assert.match(app,/dishSuggestions\(master\(\),input\.value/);
 assert.match(app,/'suggest-record-dish':pickRecordDishSuggestion/);
 assert.match(app,/document\.addEventListener\('focusin'/);
 assert.match(app,/if\(e\.key==='ArrowDown'\)/);
});
test('record date picker is constrained like the settings date picker',()=>{
 const draw=app.slice(app.indexOf('function drawRecord()'),app.indexOf('async function saveRecord()'));
 assert.match(draw,/class="dialog-date-control"/);
 assert.match(draw,/id="record-date" type="date"/);
 assert.match(css,/\.dialog-date-control input\[type=date\]/);
 assert.match(css,/::-webkit-date-and-time-value/);
});
test('editable input font on mobile avoids Safari auto-zoom without disabling pinch zoom',()=>{
 assert.match(css,/input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=file\]\),\s*select,textarea\{font-size:16px;\}/);
 assert.match(html,/width=device-width,initial-scale=1/);
 assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
 assert.match(css,/dialog\{\s*width:calc\(100% - 16px\)/);
 assert.match(css,/\.dialog-body\{overflow-x:hidden/);
});
test('the updated app parses',()=>{
 const p=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
});

test('selecting a dish uses early pointer handling and updates the live field without re-render',()=>{
 const body=app.slice(app.indexOf('function pickRecordDishSuggestion('),app.indexOf('function openRecord('));
 assert.match(body,/selectRecordDish\(editor,index,selected\)/);
 assert.match(body,/input\.value=selected\.name/);
 assert.match(body,/category\.value=selected\.category/);
 assert.match(body,/hideDishSuggestions\(\)/);
 assert.doesNotMatch(body,/drawRecord\(\)|\.innerHTML=/);
 const pointer=app.slice(app.indexOf("document.addEventListener('pointerdown'"),app.indexOf("document.addEventListener('click'"));
 assert.match(pointer,/e\.preventDefault\(\)/);
 assert.match(pointer,/pickRecordDishSuggestion\(candidate\)/);
 assert.match(pointer,/\},true\)/);
 assert.match(app,/'suggest-record-dish':pickRecordDishSuggestion/);
});
