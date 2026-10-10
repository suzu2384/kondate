import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sortCalendarExtras,presetOrderIndex,reorderPresetRules,movePresetRule} from '../src/preset-order.js';

const rules=[
 {id:'a',calendarId:'cal',keyword:'旅行',memo:'家族',icon:'car_fill'},
 {id:'b',calendarId:'cal',keyword:'資源',memo:'',icon:'leaf_3_fill'},
 {id:'c',calendarId:'cal2',keyword:'仕事',memo:'予定',icon:'briefcase_fill'},
 {id:'d',calendarId:'',keyword:'登録先なし',memo:''}
];
const source=[
 {calendarId:'cal',title:'資源',memo:'',presetId:'b'},
 {calendarId:'cal',title:'その他',memo:''},
 {calendarId:'cal2',title:'仕事',memo:'予定',presetId:'c'},
 {calendarId:'cal',title:'旅行',memo:'家族',presetId:'a'},
 {calendarId:'cal',title:'未登録',memo:''}
];
test('preset calendar events sort by saved order and unrelated events remain at the end',()=>{
 assert.deepEqual(sortCalendarExtras(source,rules).map(e=>e.title),['旅行','資源','仕事','その他','未登録']);
 const revised=reorderPresetRules(rules,['c','b','a','d']);
 assert.deepEqual(sortCalendarExtras(source,revised).map(e=>e.title),['仕事','資源','旅行','その他','未登録']);
 assert.deepEqual(source.map(e=>e.title),['資源','その他','仕事','旅行','未登録']);
});
test('matching prioritizes preset ID and then exact calendar, title and memo',()=>{
 assert.equal(presetOrderIndex({calendarId:'cal',title:'資源',memo:''},rules),1);
 assert.equal(presetOrderIndex({calendarId:'wrong',title:'資源',memo:''},rules),-1);
 assert.equal(presetOrderIndex({calendarId:'cal',title:'旅行',memo:'家族',presetId:'b'},rules),1);
 assert.equal(presetOrderIndex({calendarId:'cal',title:'知らない予定'},rules),-1);
});
test('move up/down, boundaries, and invalid order protect existing presets',()=>{
 const moved=movePresetRule(rules,'c',-1);
 assert.deepEqual(moved.map(r=>r.id),['a','c','b','d']);
 assert.equal(moved[1],rules[2]);
 assert.deepEqual(rules.map(r=>r.id),['a','b','c','d']);
 assert.equal(movePresetRule(rules,'a',-1),rules);
 assert.equal(movePresetRule(rules,'missing',1),rules);
 assert.deepEqual(reorderPresetRules(rules,['d','a','b','c']).map(r=>r.id),['d','a','b','c']);
 for(const ids of [['a','b'],['a','a','b','c'],['a','b','c','missing']]){
  assert.throws(()=>reorderPresetRules(rules,ids),/並び順/);
 }
});
test('settings uses draggable handles and calendar places meals before sorted extras',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const settings=app.slice(app.indexOf('function additionalCalendarSettings(){'),app.indexOf('function capturePresetEditorFields(){'));
 assert.match(settings,/class="icon-preset-row" data-preset-id=/);
 assert.ok(settings.indexOf('class="preset-drag-handle"')<settings.indexOf('class="preset-row-icon"'));
 assert.match(settings,/data-reorder-handle=/);
 assert.match(settings,/role="list"/);
 assert.match(app,/sortCalendarExtras\(\[\.\.\.new Set/);
 assert.match(app,/\),state\.iconRules\)/);
 const cell=app.slice(app.indexOf('function calendarCellInfo('),app.indexOf('function calendarScreen(){'));
 assert.ok(cell.indexOf('events.map(')<cell.indexOf('extra.map('),'meals precede presets');
 const details=app.slice(app.indexOf('function dayContent('),app.indexOf('function generateScreen(){'));
 assert.ok(details.indexOf('list.map(')<details.indexOf('extra.map('),'meal details precede presets');
 assert.match(app,/const PRESET_DRAG_HOLD_MS=320/);
 assert.match(app,/touchmove',e=>/);
 assert.match(app,/movePresetByKeyboard\(handle,e\.key==='ArrowUp'\?-1:1\)/);
 assert.match(app,/state\.iconRules=ordered;\s*persist\(\)/);
 assert.match(css,/\.preset-drag-ghost\{position:fixed/);
});
