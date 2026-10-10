import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
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

test('swipe release animates all the way to the destination before changing the month',()=>{
 const start=app.indexOf('function settleCalendarSwipe(offset){');
 const end=app.indexOf('// Reconcile the durable local desired state',start);
 assert.ok(start>=0&&end>start);
 let animation,frames,options,renders=0;
 const track={style:{transition:'none',transform:'translate3d(calc(-100% + -80px),0,0)'},
  animate(keyframes,settings){
   frames=keyframes;options=settings;
   animation={handlers:{},cancelled:false,
    addEventListener(type,handler){this.handlers[type]=handler;},
    cancel(){this.cancelled=true;}
   };
   return animation;
  }};
 const context={
  $:()=>track,calendarSwipeToken:0,calendarSwipeTimer:null,
  calendarSwipeAnimation:null,calendarSwipeSettling:false,
  month:new Date(2026,9,1,12),moveMonth:(d,offset)=>new Date(d.getFullYear(),d.getMonth()+offset,1,12),
  render:()=>{renders++;},matchMedia:()=>({matches:false}),
  getComputedStyle:()=>({transform:'matrix(1, 0, 0, 1, -440, 0)'}),
  setTimeout:()=>1,clearTimeout:()=>{},
  shiftCalendarMonth:()=>{throw new Error('must not change month immediately');}
 };
 const settle=runInNewContext(app.slice(start,end)+';settleCalendarSwipe',context);
 settle(1);
 assert.equal(context.month.getMonth(),9);
 assert.equal(renders,0);
 assert.equal(frames[0].transform,'matrix(1, 0, 0, 1, -440, 0)');
 assert.equal(frames[1].transform,'translate3d(-200%,0,0)');
 assert.equal(options.fill,'forwards');
 assert.equal(options.duration,300);
 assert.equal(typeof animation.handlers.finish,'function');
 animation.handlers.finish();
 assert.equal(context.month.getMonth(),10);
 assert.equal(renders,1);
 assert.equal(animation.cancelled,true);
});
test('sub-threshold swipes slide back rather than changing the displayed month',()=>{
 let animation,renders=0;
 const track={style:{},animate(){
  animation={addEventListener(type,callback){this.finish=callback;},cancel(){}};
  return animation;
 }};
 const context={
  $:()=>track,calendarSwipeToken:0,calendarSwipeTimer:null,
  calendarSwipeAnimation:null,calendarSwipeSettling:false,
  month:new Date(2026,9,1,12),moveMonth:()=>{throw new Error('month must not change');},
  render:()=>{renders++;},matchMedia:()=>({matches:false}),
  getComputedStyle:()=>({transform:'matrix(1, 0, 0, 1, -375, 0)'}),
  setTimeout:()=>1,clearTimeout:()=>{}
 };
 const start=app.indexOf('function settleCalendarSwipe(offset){');
 const end=app.indexOf('// Reconcile the durable local desired state',start);
 const settle=runInNewContext(app.slice(start,end)+';settleCalendarSwipe',context);
 settle(0);
 assert.equal(renders,0);
 animation.finish();
 assert.equal(renders,0);
 assert.equal(context.month.getMonth(),9);
 assert.equal(track.style.transform,'translate3d(-100%,0,0)');
});
test('non-Web-Animations browsers defer the CSS transition until a layout frame',()=>{
 let frames=0,renders=0,onTransition;
 const track={style:{},offsetWidth:375,
  addEventListener(type,fn){if(type==='transitionend')onTransition=fn;}
 };
 const context={
  $:()=>track,calendarSwipeToken:0,calendarSwipeTimer:null,
  calendarSwipeAnimation:null,calendarSwipeSettling:false,
  month:new Date(2026,9,1,12),moveMonth:(d,o)=>new Date(d.getFullYear(),d.getMonth()+o,1,12),
  render:()=>{renders++;},matchMedia:()=>({matches:false}),
  getComputedStyle:()=>({transform:'matrix(1, 0, 0, 1, -450, 0)'}),
  requestAnimationFrame:fn=>{frames++;context.frame=fn;},
  setTimeout:()=>1,clearTimeout:()=>{}
 };
 const start=app.indexOf('function settleCalendarSwipe(offset){');
 const end=app.indexOf('// Reconcile the durable local desired state',start);
 const settle=runInNewContext(app.slice(start,end)+';settleCalendarSwipe',context);
 settle(-1);
 assert.equal(renders,0);
 assert.equal(frames,1);
 assert.equal(track.style.transition,'none');
 context.frame();
 assert.match(track.style.transition,/^transform 300ms /);
 assert.equal(track.style.transform,'translate3d(0%,0,0)');
 onTransition({target:track,propertyName:'transform'});
 assert.equal(context.month.getMonth(),8);
 assert.equal(renders,1);
});

test('tab captions are concise and header sync plus generator master buttons are hidden',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/data-tab="calendar"[^<]*><span[^>]*><\/span>カレンダー<\/button>/);
 assert.match(html,/data-tab="generate"[^<]*><span[^>]*><\/span>献立<\/button>/);
 assert.match(html,/data-tab="photo"[^<]*><span[^>]*><\/span>記録<\/button>/);
 assert.match(html,/data-tab="settings"[^<]*><span[^>]*><\/span>設定<\/button>/);
 assert.doesNotMatch(html,/id="sync"|献立生成<\/button>|実績登録<\/button>/);
 assert.doesNotMatch(app,/\$\('#sync'\)/);
 const generator=app.slice(app.indexOf('function generateScreen()'),app.indexOf('function photoScreen()'));
 assert.doesNotMatch(generator,/料理マスター|data-action="master"/);
 assert.match(app,/button\('料理マスターを開く','master','full'\)/);
 assert.match(app,/function autoRefreshCalendar\(\)/);
 assert.match(app,/'refresh-calendars':async/);
});
