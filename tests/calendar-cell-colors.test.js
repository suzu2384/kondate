import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calendarCellBackground,normalizeCalendarCellColors,validateCalendarCellColors} from '../src/calendar-cell-colors.js';
import {createDriveSnapshot,readDriveSnapshot,restoreDriveSnapshot} from '../src/drive-backup.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fri='2026-10-30',sat='2026-10-31',sun='2026-11-01';
const prefs={saturday:'#aabbcc',sunday:'#fedcba',
 calendars:{'my-cal':'#a1b2c3','other-cal':'#d4e5f6'}};
const events=[{date:sat,calendarId:'my-cal'},{date:sat,calendarId:'other-cal'}];
test('normalizes legacy settings and rejects unsafe and invalid colors',()=>{
 assert.deepEqual(normalizeCalendarCellColors(),{saturday:'',sunday:'',calendars:{}});
 assert.deepEqual(normalizeCalendarCellColors({saturday:'#AABBCC',calendars:{a:'#ABCDEF',b:'bogus'}}),
  {saturday:'#aabbcc',sunday:'',calendars:{a:'#abcdef'}});
 assert.doesNotThrow(()=>validateCalendarCellColors(prefs));
 for(const invalid of [
  {saturday:'red'},{sunday:'url(bad)'},{calendars:{a:'transparent'}},
  {calendars:[]},{calendars:{'': '#abcdef'}},{calendars:{a:'#abc'}}
 ])assert.throws(()=>validateCalendarCellColors(invalid),/マス色/);
});
test('weekend tint is a fallback and weekdays remain theme defaults without matches',()=>{
 assert.match(calendarCellBackground(sat,[],[],prefs,[]),/#aabbcc/);
 assert.match(calendarCellBackground(sun,[],[],prefs,[]),/#fedcba/);
 assert.equal(calendarCellBackground(fri,[],[],prefs,[]),'');
 assert.match(calendarCellBackground(sat,[{date:sat,calendarId:'my-cal'}],[],prefs,['my-cal']),/#a1b2c3/);
 assert.doesNotMatch(calendarCellBackground(sat,[{date:sat,calendarId:'my-cal'}],[],prefs,['my-cal']),/#aabbcc/);
 assert.match(calendarCellBackground(sat,events,[],prefs,['other-cal']),/#d4e5f6/);
 assert.match(calendarCellBackground(sat,events,[],prefs,['not-visible']),/#aabbcc/);
});
test('two selected calendars on one date use both colors in visible calendar order',()=>{
 const mixed=calendarCellBackground(sat,[events[1]],[events[0]],prefs,['my-cal','other-cal']);
 assert.match(mixed,/^linear-gradient\(90deg/);
 assert.ok(mixed.indexOf('#a1b2c3')<mixed.indexOf('#d4e5f6'));
 assert.match(mixed,/50\.0000%/);
 assert.equal((mixed.match(/color-mix/g)||[]).length,4);
 const reversed=calendarCellBackground(sat,[events[1]],[events[0]],prefs,['other-cal','my-cal']);
 assert.ok(reversed.indexOf('#d4e5f6')<reversed.indexOf('#a1b2c3'));
});
test('calendar colors are saved in Drive and older snapshots are supported',()=>{
 const source={scopes:{},shopping:{},calendarCellColors:prefs};
 const backup=createDriveSnapshot(source);
 assert.deepEqual(backup.settings.calendarCellColors,prefs);
 const destination={scopes:{},shopping:{}};
 restoreDriveSnapshot(destination,readDriveSnapshot(backup,destination,()=>{}));
 assert.deepEqual(destination.calendarCellColors,prefs);
 assert.deepEqual(normalizeCalendarCellColors({}),{saturday:'',sunday:'',calendars:{}});
 assert.throws(()=>validateCalendarCellColors({calendars:{'private': 'not a color'}}),/マス色/);
});
test('appearance controls and calendar rendering are wired to color settings',()=>{
 const app=read('src/app.js'),css=read('style.css');
 assert.match(app,/function calendarCellColorSettings\(\)/);
 assert.match(app,/function configurableCalendarIdsForColors\(\)/);
 assert.match(app,/\.\.\.calendars\.map\(c=>c\.id\)/);
 assert.match(app,/const ids=configurableCalendarIdsForColors\(\)/);
 assert.doesNotMatch(app,/if\(!visibleCalendarIdsForColors\(\)\.includes\(id\)\)/);
 assert.match(app,/if\(!configurableCalendarIdsForColors\(\)\.includes\(id\)\)/);
 assert.match(app,/非表示のものも含む/);
 assert.match(app,/'apply-cell-color':b=>/);
 assert.match(app,/saveCalendarCellColor\(input\)/);
 assert.match(app,/case 'appearance':return [\s\S]*?calendarCellColorSettings\(\)/);
 assert.match(app,/data-cell-color-day=/);
 assert.match(app,/data-cell-color-calendar=/);
 assert.match(app,/'reset-cell-color':b=>/);
 assert.match(app,/const bg=dayBackground\(date,list,extras\)/);
 assert.match(app,/style\.setProperty\('--day-cell-background',bg\)/);
 assert.match(app,/style\.removeProperty\('--day-cell-background'\)/);
 assert.match(app,/dayBackgroundStyle\(date,list,extras\)/);
 assert.match(css,/\.month-grid \.day\[style\*="--day-cell-background"\]\{[\s\S]*?background:var\(--day-cell-background\)/);
 assert.match(css,/\.day\.selected\[style\*="--day-cell-background"\]\{[\s\S]*?box-shadow:inset/);
 assert.doesNotMatch(app,/state\.theme\.mode=el\.value;state\.calendarCellColors=/);
});
