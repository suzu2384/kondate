import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMaster,eventPayload,eventRecord} from '../src/model.js';
import {generate} from '../src/generator.js';
import {splitRecordByCalendar} from '../src/calendar-routing.js';

const dish=(name,category='main')=>({name,category});
const on=(name,date,location='')=>({date,status:'actual',location,dishes:[dish(name)]});
test('Google Calendar location is read for owned and legacy events, including trimmed restaurant addresses',()=>{
 const own=eventPayload({date:'2026-10-09',status:'actual',location:'  お寿司屋さん  ',dishes:[dish('寿司')]});
 assert.equal(own.location,'お寿司屋さん');
 const saved=eventRecord({...own,id:'own',etag:'1'});
 assert.equal(saved.location,'お寿司屋さん');
 assert.equal(saved.status,'actual');
 const legacy=eventRecord({id:'legacy',summary:'昼食：ラーメン',location:'駅前ラーメン店',start:{date:'2026-10-08'}});
 assert.equal(legacy.location,'駅前ラーメン店');
 assert.equal(legacy.owned,false);
 assert.equal(legacy.dishes[0].name,'ラーメン');
});
test('restaurants with a location do not become automatic cooking candidates or affect last cooked date',()=>{
 const r=[on('ハンバーグ','2026-10-05'),on('外食だけの料理','2026-10-08','駅前の店'),on('ハンバーグ','2026-10-09','ファミレス')];
 const master=buildMaster(r);
 assert.equal(master.some(d=>d.name==='外食だけの料理'),false);
 const burger=master.find(d=>d.name==='ハンバーグ');
 assert.equal(burger.count,1);
 assert.equal(burger.lastDate,'2026-10-05');
 const result=generate(master,{days:1,newMain:false,unique:true,preferOld:false,excludeRecent:false,balance:false,counts:{main:1}},[],'2026-10-09',()=>0.5);
 assert.equal(result.plan[0].dishes[0].name,'ハンバーグ');
});
test('blank and whitespace-only locations are home meals; external records still display as real calendar history',()=>{
 const records=[on('鍋','2026-10-07','   '),on('味噌汁','2026-10-08','')];
 assert.equal(buildMaster(records).reduce((total,d)=>total+d.count,0),2);
 const saved=eventRecord({id:'shop',summary:'天丼',location:'食堂',start:{date:'2026-10-08'}});
 assert.equal(saved.status,'actual');
 assert.equal(buildMaster([saved]).length,0);
});
test('a hand-maintained recipe can still be generated even when the same name was previously eaten out',()=>{
 const r=[on('カレー','2026-10-09','レストラン')];
 const recipe={...dish('カレー'),protein:'肉',method:'煮る'};
 const result=buildMaster(r,{}, {},[recipe]);
 assert.equal(result.length,1);
 assert.equal(result[0].count,0);
});
test('events split into different destination calendars preserve the location',()=>{
 const original={id:'abc',date:'2026-10-09',status:'actual',location:'定食屋',dishes:[dish('焼き魚','main'),dish('おひたし','side')]};
 const split=splitRecordByCalendar(original,'',{main:'main-cal',side:'side-cal'});
 assert.deepEqual(split.map(x=>x.calendarId),['main-cal','side-cal']);
 assert.deepEqual(split.map(x=>eventPayload(x.record).location),['定食屋','定食屋']);
});
