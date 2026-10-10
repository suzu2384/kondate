import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
test('calendar opens an already selected date on one tap without forcing touch focus',()=>{
 const select=app.slice(app.indexOf('function selectCalendarDate('),app.indexOf('const actions='));
 assert.match(select,/dateTapAction\(selected,date\)/);
 assert.match(select,/if\(next\.open\)\{/);
 assert.match(select,/modal\('日付の詳細',dayContent\(selected\)\)/);
 assert.doesNotMatch(select,/\.focus\(/);
 assert.match(app,/patchCalendarCells\(\)/);
 assert.match(app,/aria-pressed="\$\{date===selected\}"/);
 assert.doesNotMatch(app,/lastTappedCalendarDate/);
});
test('month strip tracks the finger and snaps or returns on release',()=>{
 assert.match(app,/\.month-grid-current/);
 assert.match(app,/\.month-grid-viewport/);
 assert.match(app,/monthSnapOffset\(touch\.clientX-start\.x,start\.width\)/);
 assert.match(app,/track\.style\.transform=/);
 assert.match(app,/settleCalendarSwipe\(offset\)/);
 assert.match(app,/ignoreDateClickUntil=Date\.now\(\)\+450/);
 assert.match(app,/if\(e\.cancelable\)e\.preventDefault\(\)/);
 assert.match(app,/document\.addEventListener\('touchcancel'/);
 assert.match(css,/\.calendar-card \.month-grid\{touch-action:pan-y/);
 assert.match(css,/\.month-grid-track\{display:flex/);
});
test('month title is centered, month controls share a height, and extras use a dialog',()=>{
 const heading=app.slice(app.indexOf('function calendarScreen()'),app.indexOf('function patchCalendarCells()'));
 assert.match(heading,/data-action="open-month-picker"/);
 assert.match(heading,/open-extra-calendars/);
 assert.match(app,/function openExtraCalendarPicker\(\)/);
 assert.match(app,/data-extra-calendar/);
 assert.match(css,/\.month-heading\{display:grid;grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
 assert.match(css,/\.month-heading \.toolbar button,\.month-heading \.calendar-switch-button/);
 const settings=app.slice(app.indexOf('function additionalCalendarSettings()'),app.indexOf('function capturePresetEditorFields()'));
 assert.doesNotMatch(settings,/その他のカレンダー表示|data-extra-calendar/);
 assert.match(settings,/アイコンと予定プリセット/);
});
test('calendar month navigation, including arrows, uses rollover-safe function',()=>{
 assert.match(app,/'prev-month':\(\)=>shiftCalendarMonth\(-1\)/);
 assert.match(app,/'next-month':\(\)=>shiftCalendarMonth\(1\)/);
 assert.match(app,/month=moveMonth\(month,offset\)/);
});
test('browser app syntax remains valid',()=>{
 const r=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});

test('year-month picker is an accessible twelve-month dialog with arbitrary year selection',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(app,/data-action="open-month-picker"/);
 assert.match(app,/function openMonthPicker\(\)/);
 assert.match(app,/Array\.from\(\{length:12\}/);
 assert.match(app,/id="month-picker-year"/);
 assert.match(app,/function chooseMonthFromPicker\(monthNumber\)/);
 assert.match(app,/month=new Date\(year,monthNumber-1,1,12\)/);
 assert.match(app,/'choose-month':b=>chooseMonthFromPicker/);
 assert.match(css,/\.month-picker-options\{display:grid/);
 assert.doesNotMatch(html,/id="status-legend"/);
 assert.doesNotMatch(html,/● 調理実績|◇ 献立案|• 既存の献立/);
 assert.match(css,/@media\(min-width:761px\)\{\s*\.calendar-screen \.month-grid \.day/);
 assert.match(css,/\.calendar-screen \.month-grid \.event-chip\.general-event\.has-icon\{font-size:13px/);
});
