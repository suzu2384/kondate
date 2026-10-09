import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
test('calendar uses first tap to select and second tap for detail without losing keyboard focus',()=>{
 const select=app.slice(app.indexOf('function selectCalendarDate('),app.indexOf('const actions='));
 assert.match(select,/dateTapAction\(selected,lastTappedCalendarDate,date\)/);
 assert.match(select,/if\(next\.open\)\{/);
 assert.match(select,/modal\('日付の詳細',dayContent\(selected\)\)/);
 assert.match(select,/focus\(\{preventScroll:true\}\)/);
 assert.match(app,/aria-pressed="\$\{date===selected\}"/);
 assert.match(app,/lastTappedCalendarDate='';render\(\)/);
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
