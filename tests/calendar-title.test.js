import test from 'node:test';
import assert from 'node:assert/strict';
import {eventPayload} from '../src/model.js';
test('new calendar events use unprefixed titles',()=>{assert.equal(eventPayload({date:'2026-10-09',status:'actual',dishes:[{name:'鮭',category:'main'}]}).summary,'鮭');});

import {eventRecord} from '../src/model.js';
import {splitRecordByCalendar} from '../src/calendar-routing.js';
test('split category destinations and preserve shared-calendar categories',()=>{
 const input={id:'abc',date:'2026-10-09',status:'actual',dishes:[{name:'魚',category:'main'},{name:'冷奴',category:'side'},{name:'味噌汁',category:'soup'}]};
 const records=splitRecordByCalendar(input,'',{main:'main-cal',side:'other-cal',soup:'other-cal'});
 assert.deepEqual(records.map(x=>x.calendarId),['main-cal','other-cal']);
 assert.deepEqual(records.map(x=>eventPayload(x.record).summary),['魚','冷奴、味噌汁']);
 assert.deepEqual(eventRecord({...eventPayload(records[1].record),id:'part2'}).dishes.map(x=>x.category),['side','soup']);
});

test('planned dishes also have unprefixed titles and keep the plan marker',()=>{
 const record={date:'2026-10-09',status:'plan',dishes:[{name:'カレー',category:'main'}]};
 const event=eventPayload(record);
 assert.equal(event.summary,'カレー');
 assert.equal(event.extendedProperties.private.state,'plan');
 assert.equal(eventRecord({...event,id:'plan'}).status,'plan');
});
