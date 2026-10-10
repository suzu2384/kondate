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
test('swipe navigation is confined to the calendar grid, horizontal only and cancels tap',()=>{
 assert.match(app,/\.month-grid'\)/);
 assert.match(app,/horizontalMonthSwipe\(start,/);
 assert.match(app,/ignoreDateClickUntil=Date\.now\(\)\+350/);
 assert.match(app,/if\(e\.cancelable\)e\.preventDefault\(\)/);
 assert.match(app,/document\.addEventListener\('touchcancel'/);
 assert.match(css,/\.calendar-card \.month-grid\{touch-action:pan-y/);
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
