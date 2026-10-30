import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 CALENDAR_DISPLAY_OPTIONS,calendarDisplayMode,filterCalendarEntries,
 normalizeCalendarDisplayModes,validateCalendarDisplayModes
} from '../src/calendar-display-modes.js';
import {calendarCellBackground} from '../src/calendar-cell-colors.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const date='2026-10-30',assigned=['meal'],oldExtra=['old-extra'];
const modes={meal:'detail','old-extra':'hidden',holiday:'visible',personal:'detail'};
const events=[
 {date,calendarId:'meal',title:'調理実績'},
 {date,calendarId:'old-extra',title:'旧表示'},
 {date,calendarId:'holiday',title:'祝日'},
 {date,calendarId:'personal',title:'家族の予定'}
];
test('three modes preserve previously selected calendars and meal calendars',()=>{
 assert.deepEqual(CALENDAR_DISPLAY_OPTIONS,['visible','detail','hidden']);
 assert.equal(calendarDisplayMode('meal',{},assigned,oldExtra),'visible');
 assert.equal(calendarDisplayMode('old-extra',{},assigned,oldExtra),'visible');
 assert.equal(calendarDisplayMode('unchecked',{},assigned,oldExtra),'hidden');
 assert.equal(calendarDisplayMode('meal',modes,assigned,oldExtra),'detail');
 assert.equal(calendarDisplayMode('old-extra',modes,assigned,oldExtra),'hidden');
});
test('detail-only entries disappear from cells but are available in date detail',()=>{
 assert.deepEqual(filterCalendarEntries(events,modes,assigned,oldExtra,'cell').map(e=>e.title),['祝日']);
 assert.deepEqual(filterCalendarEntries(events,modes,assigned,oldExtra,'detail').map(e=>e.title),
  ['調理実績','祝日','家族の予定']);
 assert.deepEqual(filterCalendarEntries(events,{},assigned,oldExtra,'cell').map(e=>e.title),
  ['調理実績','旧表示']);
});
test('detail-only events still apply their configured colors but hidden ones do not',()=>{
 const prefs={calendars:{meal:'#aabbcc','old-extra':'#ff0000',personal:'#112233',holiday:'#123456'}};
 const background=calendarCellBackground(date,events,[],prefs,['meal','holiday','personal']);
 for(const color of ['#aabbcc','#112233','#123456'])assert.match(background,new RegExp(color));
 assert.doesNotMatch(background,/#ff0000/);
});
test('invalid and unsafe display mode preferences are rejected',()=>{
 assert.deepEqual(normalizeCalendarDisplayModes(),{});
 assert.deepEqual(normalizeCalendarDisplayModes({a:'detail',b:'bad'}),{a:'detail'});
 assert.doesNotThrow(()=>validateCalendarDisplayModes(modes));
 for(const value of [[],null,{bad:'all'},{'':'visible'}])
  assert.throws(()=>validateCalendarDisplayModes(value),/表示方法/);
 assert.throws(()=>validateCalendarDisplayModes(JSON.parse('{"__proto__":"visible"}')),/表示方法/);
});
test('calendar UI, sync and detail view use the same display mode rules',()=>{
 const app=read('src/app.js'),sw=read('sw.js'),css=read('style.css');
 assert.match(app,/data-calendar-display-mode=/);
 assert.match(app,/詳細のみ/);
 assert.match(app,/const cellList=forCalendarDisplay\(list,'cell'\),cellExtras=forCalendarDisplay\(extras,'cell'\)/);
 assert.match(app,/records:forCalendarDisplay\(records\(\),'detail'\)/);
 assert.match(app,/otherEvents:forCalendarDisplay\(extraEvents\(\),'detail'\)/);
 assert.match(app,/calendarCellBackground\(date,list,extras,state\.calendarCellColors,visibleCalendarIdsForColors\(\)\)/);
 assert.match(app,/\.\.\.Object\.entries\(state\.calendarDisplayModes\)\.filter\(\(\[,mode\]\)=>mode!=='hidden'\)/);
 assert.match(app,/validateCalendarDisplayModes\(p\.state\.calendarDisplayModes\)/);
 assert.match(sw,/'\.\/src\/calendar-display-modes.js'/);
 assert.match(css,/\.extra-calendar-list \.calendar-display-row select\{/);
});
