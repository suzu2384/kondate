import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {matchingDisplayPreset,presetIcon} from '../src/icon-presets.js';
import {PresetWriteQueue} from '../src/preset-queue.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css');
const rule={id:'abc',calendarId:'calendar-expected',keyword:'資源回収',memo:'',icon:'recycle_fill'};
const date='2026-10-28';
test('cross-calendar title icon matches are display-only, not evidence of wrong write targets',()=>{
 const event={summary:'資源回収のお知らせ',description:''};
 assert.equal(matchingDisplayPreset(event,'calendar-expected',[rule])?.id,'abc');
 assert.equal(matchingDisplayPreset(event,'calendar-other',[rule])?.id,'abc');
 assert.equal(presetIcon(event,'calendar-other',[rule]),'recycle_fill');
 assert.equal(matchingDisplayPreset(event,'calendar-other',[{...rule,calendarId:''}])?.id,'abc',
  'Unbound display-only keyword rules still match across calendars');
});
test('calendar preset taps require a confirmed writable destination and first event sync',()=>{
 const begin=app.indexOf('function togglePresetOnDate('),end=app.indexOf('async function selectCalendarDate(',begin);
 assert.ok(begin>=0&&end>begin);
 const calls=[],bucket={lastSync:null,events:[]};
 const ctx={
  selectedPresetId:'abc',state:{iconRules:[rule]},presetCalendarVisible:()=>true,
  api:{connected:true},calendarAutoReady:false,calendars:[],
  dataFor:()=>bucket,presetQueue:{toggle:(...args)=>calls.push(args)},
  render:()=>{}
 };
 const click=runInNewContext(app.slice(begin,end)+';togglePresetOnDate',ctx);
 assert.throws(()=>click(date),/一覧を取得/);
 ctx.calendarAutoReady=true;
 ctx.calendars=[{id:'calendar-other',accessRole:'owner'}];
 assert.throws(()=>click(date),/一覧を取得/);
 ctx.calendars=[{id:rule.calendarId,accessRole:'reader'}];
 assert.throws(()=>click(date),/編集できません/);
 ctx.calendars=[{id:rule.calendarId,accessRole:'writer'}];
 assert.throws(()=>click(date),/初回同期/);
 bucket.lastSync=123456;
 assert.doesNotThrow(()=>click(date));
 assert.equal(calls.length,1);
 assert.equal(calls[0][0].calendarId,rule.calendarId);
 assert.equal(calls[0][1],date);
});
test('queued insert with a changed preset calendar is never sent to its former destination',()=>{
 const begin=app.indexOf(' let staleInserts=0;',app.indexOf('async function flushPendingPresets(){'));
 const end=app.indexOf(' const entries=presetQueue.list(),keys=',begin);
 assert.ok(begin>=0&&end>begin);
 const discard=runInNewContext('(state,presetQueue)=>{'+app.slice(begin,end)+'return staleInserts;}');
 const data=new Map();
 const store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let n=0;const q=new PresetWriteQueue(store,()=>String(++n).padStart(32,'a'));
 q.toggle(rule,date,[]);
 assert.equal(q.size,1);
 const changed={...rule,calendarId:'calendar-new'};
 assert.equal(discard({iconRules:[changed]},q),1);
 assert.equal(q.size,0);
 // Pending removal stays associated with the original event, even if edited.
 q.toggle(rule,date,[{id:'server',summary:rule.keyword,description:rule.memo,start:{date}}]);
 assert.equal(q.size,1);
 assert.equal(discard({iconRules:[changed]},q),0);
 assert.equal(q.list()[0].present,false);
 assert.equal(q.list()[0].rule.calendarId,rule.calendarId);
});
test('memo icons match memo-free icon sizes, captions match cooking names',()=>{
 const desktop=/\.month-grid \.day \.event-chip\.general-event\.has-icon:not\(\.icon-only\)\{\s*font-size:15px/;
 const mobile=/@media\(max-width:760px\)\{\s*\.month-grid \.day \.event-chip\.general-event\.has-icon:not\(\.icon-only\)\{\s*font-size:13px/;
 assert.match(css,desktop);
 assert.match(css,mobile);
 assert.match(css,/\.calendar-preset-no-memo \.event-chip\.general-event\.has-icon\.icon-only\{[\s\S]*?font-size:15px/);
 assert.match(css,/\.calendar-preset-no-memo \.event-chip\.general-event\.has-icon\.icon-only\{[\s\S]*?font-size:13px/);
 assert.match(css,/\.month-grid \.day \.event-chip\.general-event\.has-icon:not\(\.icon-only\) \.calendar-event-note\{[\s\S]*?font-size:13px/);
 assert.match(css,/\.month-grid \.day \.event-chip\.general-event\.has-icon:not\(\.icon-only\) \.calendar-event-note\{[\s\S]*?font-size:9px/);
});
