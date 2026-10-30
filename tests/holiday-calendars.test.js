import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 JAPANESE_HOLIDAYS_ALL,JAPANESE_HOLIDAYS_OFFICIAL,
 JAPANESE_HOLIDAY_SELECTIONS,isJapaneseHolidayCalendarId,
 holidayEventSourceId,normalizeJapaneseHolidaySelection,validateJapaneseHolidaySelection
} from '../src/holiday-calendars.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('combined and legacy Japanese holiday feeds default to public holidays only',()=>{
 assert.deepEqual(JAPANESE_HOLIDAY_SELECTIONS,['official','all']);
 for(const id of [JAPANESE_HOLIDAYS_ALL,'japanese__ja@holiday.calendar.google.com']){
  assert.equal(isJapaneseHolidayCalendarId(id),true);
  assert.equal(holidayEventSourceId(id),JAPANESE_HOLIDAYS_OFFICIAL);
  assert.equal(holidayEventSourceId(id,'official'),JAPANESE_HOLIDAYS_OFFICIAL);
  assert.equal(holidayEventSourceId(id,'all'),JAPANESE_HOLIDAYS_ALL);
 }
 assert.equal(holidayEventSourceId(JAPANESE_HOLIDAYS_OFFICIAL),JAPANESE_HOLIDAYS_OFFICIAL);
 assert.equal(holidayEventSourceId('family@example.com','official'),'family@example.com');
 assert.equal(holidayEventSourceId('family@example.com','all'),'family@example.com');
});

test('holiday selection only accepts supported values',()=>{
 assert.equal(normalizeJapaneseHolidaySelection(undefined),'official');
 assert.equal(normalizeJapaneseHolidaySelection('other'),'official');
 assert.equal(normalizeJapaneseHolidaySelection('all'),'all');
 assert.doesNotThrow(()=>validateJapaneseHolidaySelection('official'));
 assert.doesNotThrow(()=>validateJapaneseHolidaySelection('all'));
 for(const invalid of [undefined,null,'','both','hidden',{},['all']])
  assert.throws(()=>validateJapaneseHolidaySelection(invalid),/表示内容/);
});

test('holiday-only API source preserves the subscribed calendar identity',()=>{
 const app=read('src/app.js');
 assert.match(app,/api\.events\(holidayEventSourceId\(calendarId,state\.japaneseHolidaySelection\),state\.from/);
 assert.match(app,/const bucket=dataFor\(calendarId\)/);
 assert.match(app,/return \{id:event\.id\|\|'',calendarId,date,title,memo:/);
 assert.match(app,/data-holiday-calendar-selection=/);
 assert.match(app,/祝日のみ/);
 assert.match(app,/祝日とその他の行事/);
 assert.match(app,/validateJapaneseHolidaySelection\(p\.state\.japaneseHolidaySelection\)/);
 assert.match(app,/state\.japaneseHolidaySelection=normalizeJapaneseHolidaySelection/);
});

test('holiday mode is cached and deployed with settings and remains independent of display',()=>{
 const drive=read('src/drive-backup.js'),sw=read('sw.js'),css=read('style.css');
 assert.match(drive,/'calendarDisplayModes','japaneseHolidaySelection','calendarCellColors'/);
 assert.match(drive,/validateJapaneseHolidaySelection\(settings\.japaneseHolidaySelection\)/);
 assert.match(sw,/'\.\/src\/holiday-calendars\.js'/);
 assert.match(css,/\.extra-calendar-list \.calendar-holiday-options/);
 const google=read('src/google.js');
 assert.match(google,/encodeURIComponent\(calendarId\)/);
 assert.match(google,/async events\(calendarId,from,to\)/);
});
