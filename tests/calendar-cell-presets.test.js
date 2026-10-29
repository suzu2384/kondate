import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {sortCalendarExtras} from '../src/preset-order.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css');
const start=app.indexOf('function calendarCellInfo('),end=app.indexOf('function openMonthPicker(){',start);
assert.ok(start>=0&&end>start);
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const cell=runInNewContext(app.slice(start,end)+';calendarCellInfo',{
 esc:escapeText,iconMarkup:icon=>'<svg data-icon="'+escapeText(icon)+'"></svg>'
});
const rules=[
 {id:'a',calendarId:'cal',keyword:'優先1',memo:'',icon:'star_fill'},
 {id:'b',calendarId:'cal',keyword:'優先2',memo:'持参',icon:'bag_fill'},
 {id:'c',calendarId:'cal',keyword:'優先3',memo:'',icon:'recycle_fill'},
 {id:'d',calendarId:'cal',keyword:'優先4',memo:'午後',icon:'car_fill'},
 {id:'e',calendarId:'cal',keyword:'優先5',memo:'',icon:'leaf_fill'}
];
const date='2026-10-28';
const event=(title,memo,icon)=>({calendarId:'cal',date,title,memo,icon,color:'#123456'});
const source=[
 event('優先5','','leaf_fill'),
 event('優先4','午後','car_fill'),
 event('優先1','','star_fill'),
 event('優先3','','recycle_fill'),
 event('優先2','持参','bag_fill')
];

test('date cell shows memo entries first while preserving saved preset priority in each group',()=>{
 const sorted=sortCalendarExtras(source,rules);
 assert.deepEqual(sorted.map(e=>e.title),['優先1','優先2','優先3','優先4','優先5']);
 const result=cell(date,[],sorted);
 assert.equal(result.count,5);
 const text=result.html;
 const indices=['優先2／持参','優先4／午後','優先1','優先3','優先5']
  .map(label=>text.indexOf('title="'+label+'"'));
 assert.ok(indices.every(i=>i>=0));
 assert.ok(indices.every((index,i)=>i===0||indices[i-1]<index),'Memo-first stable partition');
 assert.ok(text.indexOf('title="優先4／午後"')<text.indexOf('calendar-preset-no-memo'));
 // Stored order is not mutated or redefined by this display-only layout.
 assert.deepEqual(sorted.map(e=>e.title),['優先1','優先2','優先3','優先4','優先5']);
 assert.match(app,/sortCalendarExtras\(/);
});

test('memo entries remain separate full-width lines, icon-only entries share one wrapping container',()=>{
 const result=cell(date,[],sortCalendarExtras(source,rules));
 const html=result.html;
 assert.equal((html.match(/class="calendar-preset-no-memo"/g)||[]).length,1);
 const index=html.indexOf('<span class="calendar-preset-no-memo">');
 const before=html.slice(0,index),inside=html.slice(index);
 assert.equal((before.match(/class="event-chip general-event/g)||[]).length,2);
 assert.equal((inside.match(/class="event-chip general-event/g)||[]).length,3);
 assert.equal((inside.match(/role="img"/g)||[]).length,3);
 assert.doesNotMatch(inside,/class="calendar-event-note"/);
 assert.match(before,/持参/);
 assert.match(before,/午後/);
 assert.match(css,/\.month-grid \.day \.calendar-preset-no-memo\{[\s\S]*?flex-wrap:wrap/);
 assert.match(css,/\.month-grid \.day \.calendar-preset-no-memo \.event-chip\.general-event\.has-icon\.icon-only\{[\s\S]*?flex:0 0 auto/);
});

test('meal entries remain ahead of presets and ordinary calendar events keep a full row',()=>{
 const cooking=[{date,status:'actual',owned:true,dishes:[{name:'野菜炒め'}]}];
 const extras=sortCalendarExtras([
  {calendarId:'other',date,title:'通常予定',memo:'',icon:''},
  ...source
 ],rules);
 const result=cell(date,cooking,extras);
 assert.equal(result.count,7);
 assert.ok(result.html.indexOf('野菜炒め')<result.html.indexOf('持参'));
 assert.match(result.html,/class="event-chip general-event\s+no-icon/);
 assert.match(css,/\.month-grid \.day \.calendar-preset-no-memo \.event-chip\.general-event\.no-icon\{[\s\S]*?flex:0 0 100%/);
});

test('non-preset, text-only events are vertically centered within their own rows',()=>{
 const result=cell(date,[],[
  {calendarId:'holidays',date,title:'スポーツの日',memo:'',icon:''},
  event('プリセット','', 'star_fill')
 ]);
 assert.match(result.html,/class="event-chip general-event  no-icon/);
 // The non-preset row keeps the same one-item-per-row layout, without
 // vertically centering the entire day or shifting meal/preset priorities.
 assert.match(css,/\.month-grid \.day \.calendar-preset-no-memo \.event-chip\.general-event\.no-icon\{[\s\S]*?display:flex;flex:0 0 100%/);
 assert.match(css,/\.month-grid \.day \.calendar-preset-no-memo \.event-chip\.general-event\.no-icon\{[\s\S]*?min-height:18px;align-items:center;justify-content:flex-start/);
 assert.match(css,/@media\(max-width:760px\)\{\s*\.month-grid \.day \.calendar-preset-no-memo\{[^}]*\}\s*\.month-grid \.day \.calendar-preset-no-memo \.event-chip\.general-event\.no-icon\{min-height:16px\}/);
});

test('pending changes keep their existing visual state and sparse memos are treated as absent',()=>{
 const result=cell(date,[],[
  {...event('予定','空白','car_fill'),memo:'  ',pending:true},
  event('メモ','確認','bag_fill')
 ]);
 assert.match(result.html,/is-pending/);
 assert.match(result.html,/title="予定"[^>]*role="img"/);
 assert.ok(result.html.indexOf('title="メモ／確認"')<result.html.indexOf('title="予定"'));
});
