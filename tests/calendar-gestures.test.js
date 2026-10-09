import test from 'node:test';
import assert from 'node:assert/strict';
import {dateTapAction,horizontalMonthSwipe,moveMonth} from '../src/calendar-gestures.js';

test('a highlighted date opens its details immediately on a single tap',()=>{
 const today='2026-10-09';
 const action=dateTapAction(today,today);
 assert.deepEqual(action,{selected:today,open:true});
 // Closing the details doesn't deselect the day.
 assert.equal(dateTapAction(action.selected,today).open,true);
});
test('an unselected date is selected first, then opens on its next tap',()=>{
 const first=dateTapAction('2026-10-09','2026-10-12');
 assert.deepEqual(first,{selected:'2026-10-12',open:false});
 assert.deepEqual(dateTapAction(first.selected,'2026-10-12'),{selected:'2026-10-12',open:true});
});
test('invalid date does not change selection or open the details',()=>{
 assert.deepEqual(dateTapAction('2026-10-09','not-a-date'),{selected:'2026-10-09',open:false});
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
