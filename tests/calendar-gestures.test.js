import test from 'node:test';
import assert from 'node:assert/strict';
import {dateTapAction,horizontalMonthSwipe,moveMonth} from '../src/calendar-gestures.js';

test('the preselected today requires two real taps to open the date details',()=>{
 let selected='2026-10-09',lastTapped='';
 const first=dateTapAction(selected,lastTapped,'2026-10-09');
 assert.deepEqual(first,{selected:'2026-10-09',lastTapped:'2026-10-09',open:false});
 const second=dateTapAction(first.selected,first.lastTapped,'2026-10-09');
 assert.deepEqual(second,{selected:'2026-10-09',lastTapped:'',open:true});
 const third=dateTapAction(second.selected,second.lastTapped,'2026-10-09');
 assert.equal(third.open,false,'closing details does not make the next tap act like a second tap');
});
test('a different day resets the two-tap sequence, even when another day was selected',()=>{
 const a=dateTapAction('2026-10-09','','2026-10-12');
 assert.equal(a.open,false);
 const b=dateTapAction(a.selected,a.lastTapped,'2026-10-13');
 assert.equal(b.open,false);
 const c=dateTapAction(b.selected,b.lastTapped,'2026-10-13');
 assert.equal(c.open,true);
});
test('left swipe goes forward; right swipe goes back',()=>{
 const start={x:250,y:200,time:1000};
 assert.equal(horizontalMonthSwipe(start,{x:130,y:208,time:1280}),1);
 assert.equal(horizontalMonthSwipe(start,{x:370,y:190,time:1320}),-1);
});
test('short moves, vertical scrolls and slow gestures do not change months',()=>{
 const start={x:250,y:200,time:1000};
 assert.equal(horizontalMonthSwipe(start,{x:215,y:204,time:1050}),0);
 assert.equal(horizontalMonthSwipe(start,{x:180,y:90,time:1230}),0);
 assert.equal(horizontalMonthSwipe(start,{x:110,y:206,time:2600}),0);
 assert.equal(horizontalMonthSwipe(start,{x:150,y:206,time:900}),0);
 assert.equal(horizontalMonthSwipe(null,{x:100,y:206,time:900}),0);
});
test('month navigation advances across year boundaries without date overflow',()=>{
 const january=moveMonth(new Date(2026,11,1,12),1);assert.equal(january.getFullYear(),2027);assert.equal(january.getMonth(),0);
 assert.equal(moveMonth(new Date(2027,0,1,12),-1).getMonth(),11);
 const fromEndOfMonth=moveMonth(new Date(2026,0,31,12),1);
 assert.equal(fromEndOfMonth.getMonth(),1);
 assert.equal(fromEndOfMonth.getDate(),1);
});
