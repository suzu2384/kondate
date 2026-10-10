import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CALENDAR_REFRESH_MINUTES,DEFAULT_CALENDAR_REFRESH_MINUTES,normalizeCalendarRefreshMinutes,isCalendarRefreshDue,calendarEventsChanged,fetchCalendarUpdates} from '../src/calendar-auto-refresh.js';

const ready={minutes:5,lastSyncAt:1000,lastAttemptAt:1000,now:301001,connected:true,online:true,visible:true,busy:false,configured:true};
test('selectable polling intervals, including off, and valid defaults',()=>{
 assert.deepEqual(CALENDAR_REFRESH_MINUTES,[0,1,3,5,10,15,30,60]);
 assert.equal(DEFAULT_CALENDAR_REFRESH_MINUTES,5);
 assert.equal(normalizeCalendarRefreshMinutes(30),30);
 assert.equal(normalizeCalendarRefreshMinutes('5'),5);
 assert.equal(normalizeCalendarRefreshMinutes(123),5);
});
test('refresh only when the interval has elapsed',()=>{
 assert.equal(isCalendarRefreshDue(ready),true);
 assert.equal(isCalendarRefreshDue({...ready,now:300999}),false);
 assert.equal(isCalendarRefreshDue({...ready,minutes:10}),false);
 assert.equal(isCalendarRefreshDue({...ready,minutes:0}),false);
 assert.equal(isCalendarRefreshDue({...ready,lastSyncAt:0,lastAttemptAt:0}),true);
});
test('skip background, offline, signed-out, busy and unconfigured states',()=>{
 for(const [field,value] of Object.entries({visible:false,online:false,connected:false,busy:true,configured:false})){
  assert.equal(isCalendarRefreshDue({...ready,[field]:value}),false,field);
 }
});
test('do not hammer API on focus after errors',()=>{
 assert.equal(isCalendarRefreshDue({...ready,minutes:60,lastSyncAt:0,lastAttemptAt:300000}),false);
 assert.equal(isCalendarRefreshDue({...ready,minutes:60,lastSyncAt:0,lastAttemptAt:300000,now:601000}),true);
});
test('UI, event handlers, Drive persistence and service worker are wired',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const backup=readFileSync(new URL('../src/drive-backup.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(app,/id="calendar-refresh-minutes"/);
 assert.match(app,/state\.calendarRefreshMinutes=normalizeCalendarRefreshMinutes\(Number\(el\.value\)\)/);
 assert.match(app,/window\.addEventListener\('online',[^\n]*autoRefreshCalendar/);
 assert.match(app,/window\.addEventListener\('focus',[^\n]*autoRefreshCalendar/);
 assert.match(app,/visibilitychange/);
 assert.match(app,/setInterval\([^\n]*autoRefreshCalendar/);
 assert.match(app,/if\(!automatic\|\|changed\)render\(\)/);
 assert.match(app,/fetchCalendarUpdates\(ids/);
 assert.match(app,/\.\.\.state\.extraCalendarIds/);
 assert.doesNotMatch(app,/automatic&&\(presetFlushing\|\|presetQueue\.size\)/);
 assert.match(app,/calendarEventsChanged\(dataFor\(calendarId\)\.events,events\)/);
 assert.match(backup,/calendarRefreshMinutes/);
 assert.match(sw,/calendar-auto-refresh\.js/);
});

test('external edits repaint even when Google event ID and etag did not change',()=>{
 const saved=[{id:'1',etag:'"same"',summary:'学校',start:{date:'2026-10-10'},description:'旧メモ'}];
 assert.equal(calendarEventsChanged(saved,structuredClone(saved)),false);
 assert.equal(calendarEventsChanged(saved,[{...saved[0],summary:'学校行事'}]),true);
 assert.equal(calendarEventsChanged(saved,[{...saved[0],start:{date:'2026-10-11'}}]),true);
 assert.equal(calendarEventsChanged(saved,[{...saved[0],description:'新メモ'}]),true);
 assert.equal(calendarEventsChanged(saved,[]),true);
});
test('a broken extra calendar does not discard the other calendar changes',async()=>{
 const called=[];
 const outcome=await fetchCalendarUpdates(['meal','extra-failing','extra-ok'],async id=>{
  called.push(id);
  if(id==='extra-failing')throw Error('permission denied');
  return [{id:id+'-1',summary:'スマホで変更した予定'}];
 });
 assert.deepEqual(called,['meal','extra-failing','extra-ok']);
 assert.deepEqual(outcome.received.map(x=>x.calendarId),['meal','extra-ok']);
 assert.deepEqual(outcome.failed.map(x=>x.calendarId),['extra-failing']);
 assert.match(outcome.failed[0].error.message,/permission denied/);
});
