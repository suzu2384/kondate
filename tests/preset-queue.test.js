import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PresetWriteQueue,PRESET_FLUSH_INTERVAL_MS} from '../src/preset-queue.js';
import {CalendarClient} from '../src/google.js';

function storage(){
 const data=new Map();
 return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
}
let next=0;
const ids=()=>String(++next).padStart(32,'a');
const date='2026-10-10';
const rule={id:'a9a9a9a9a9',keyword:'休み',memo:'予定A',calendarId:'my-calendar',icon:'sun_fill',color:'#FF0000'};
const confirmed=(rule,id='existing')=>({id,summary:rule.keyword,description:rule.memo,start:{date},etag:'"v1"',extendedProperties:{private:{kondatePreset:'1',kondatePresetId:rule.id}}});
test('one tap is visible instantly; second tap cancels without Google writes',()=>{
 const s=storage(),q=new PresetWriteQueue(s,ids);
 assert.equal(PRESET_FLUSH_INTERVAL_MS,5000);
 assert.deepEqual(q.toggle(rule,date,[]),{present:true,count:1});
 assert.equal(q.project(rule.calendarId,[])[0]._presetPending,true);
 assert.equal(q.project(rule.calendarId,[])[0].start.date,date);
 assert.deepEqual(q.toggle(rule,date,[]),{present:false,count:0});
 assert.deepEqual(q.project(rule.calendarId,[]),[]);
 assert.equal(s.getItem(q.storageKey),null);
});
test('existing event toggles to deleted, back to visible before flush',()=>{
 const q=new PresetWriteQueue(storage(),ids),events=[confirmed(rule)];
 assert.deepEqual(q.toggle(rule,date,events),{present:false,count:1});
 assert.equal(q.project(rule.calendarId,events).length,0);
 assert.deepEqual(q.toggle(rule,date,events),{present:true,count:0});
 assert.deepEqual(q.project(rule.calendarId,events),events);
});
test('journal survives reload and preserves original title, memo and calendar',()=>{
 const store=storage(),q=new PresetWriteQueue(store,ids);
 q.toggle(rule,date,[]);
 const q2=new PresetWriteQueue(store,ids);
 assert.equal(q2.size,1);
 assert.equal(q2.list()[0].rule.memo,rule.memo);
 assert.equal(q2.list()[0].rule.calendarId,rule.calendarId);
 assert.equal(q2.project(rule.calendarId,[]).length,1);
 q2.ack(q2.list()[0].key,q2.list()[0].version);
 assert.equal(new PresetWriteQueue(store,ids).size,0);
});
test('in-flight tap does not disappear after initial network operation succeeds',()=>{
 const store=storage(),q=new PresetWriteQueue(store,ids);
 q.toggle(rule,date,[]);
 const original=q.list()[0];
 q.markInflight([original.key]);
 assert.equal(q.toggle(rule,date,[]).present,false);
 assert.equal(q.size,1);
 assert.equal(q.ack(original.key,original.version),false);
 q.unmarkInflight([original.key]);
 assert.equal(q.project(rule.calendarId,[confirmed(rule)]).length,0);
});
test('different memos, calendars and dates are independent queued toggles',()=>{
 const q=new PresetWriteQueue(storage(),ids);
 q.toggle(rule,date,[]);
 q.toggle({...rule,memo:'予定B'},date,[]);
 q.toggle({...rule,calendarId:'other'},date,[]);
 q.toggle(rule,'2026-10-11',[]);
 assert.equal(q.size,4);
 assert.equal(q.project(rule.calendarId,[]).length,3);
 assert.equal(q.project('other',[]).length,1);
});
function client(fetcher){const c=new CalendarClient(fetcher);c.token='fake';c.expires=Date.now()+120000;return c;}
test('Calendar API sends multiple preset writes in one multipart request and maps results',async()=>{
 const operations=[
  {type:'insert',calendarId:'a@b',rule,date,id:'0123456789abcdef0123456789abcdef'},
  {type:'delete',calendarId:'a@b',event:{id:'old1',etag:'"etag"'}}
 ];
 let calls=0;
 const c=client(async(url,init)=>{
  calls++;assert.equal(url,'https://www.googleapis.com/batch/calendar/v3');
  assert.match(init.headers['Content-Type'],/multipart\/mixed; boundary=/);
  assert.match(init.body,/POST \/calendar\/v3\/calendars\/a%40b\/events HTTP\/1\.1/);
  assert.match(init.body,/DELETE \/calendar\/v3\/calendars\/a%40b\/events\/old1 HTTP\/1\.1/);
  assert.match(init.body,/If-Match: "etag"/);
  assert.match(init.body,/予定A/);
  const boundary='batch_response';
  const body='--'+boundary+'\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n'+
   JSON.stringify({id:operations[0].id})+'\r\n--'+boundary+'\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 204 No Content\r\n\r\n\r\n--'+boundary+'--\r\n';
  return new Response(body,{status:200,headers:{'Content-Type':'multipart/mixed; boundary='+boundary}});
 });
 const results=await c.batchPresetChanges(operations);
 assert.equal(calls,1);
 assert.deepEqual(results.map(r=>r.ok),[true,true]);
 assert.equal(results[0].event.id,operations[0].id);
});
test('unsupported batch endpoint falls back to idempotent individual calls',async()=>{
 let calls=[];
 const c=client(async(url,init)=>{
  calls.push([url,init.method]);
  if(url.includes('/batch/calendar/v3'))return new Response('missing',{status:404});
  return new Response(init.method==='POST'?JSON.stringify({id:'abc'}):null,
   {status:init.method==='POST'?201:204,headers:{'Content-Type':'application/json'}});
 });
 const results=await c.batchPresetChanges([
  {type:'insert',calendarId:'a',rule,date,id:'0123456789abcdef0123456789abcdef'},
  {type:'delete',calendarId:'a',event:{id:'abc',etag:'"etag"'}}
 ]);
 assert.deepEqual(results.map(r=>r.ok),[true,true]);
 assert.deepEqual(calls.map(x=>x[1]),['POST','POST','DELETE']);
});
test('source keeps journal and batch wired without blocking every tap',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/presetQueue\.project\(calendarId/);
 assert.match(app,/presetQueue\.toggle\(rule,date/);
 assert.match(app,/api\.batchPresetChanges\(batch\)/);
 assert.match(app,/setInterval\(\(\)=>\{if\(presetQueue\.size\)/);
 assert.doesNotMatch(app.slice(app.indexOf('function togglePresetOnDate'),app.indexOf('async function selectCalendarDate')),/await api\.events/);
});
