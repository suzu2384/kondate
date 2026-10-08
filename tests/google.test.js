import test from 'node:test';
import assert from 'node:assert/strict';
import {CalendarClient} from '../src/google.js';
import {eventPayload} from '../src/model.js';
const response=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function client(fn){const c=new CalendarClient(fn);c.token='fake-test-token';c.expires=Date.now()+60000;return c;}
const record={id:'abc012',date:'2026-10-08',status:'actual',owned:true,etag:'"v1"',dishes:[{name:'カレー',category:'main'}]};
test('pagination retrieves every page and encodes calendar IDs',async()=>{let n=0;const c=client(async url=>{n++;if(n===1){assert.ok(url.includes('a%40b'));return response({items:[{id:'1'}],nextPageToken:'next'});}assert.ok(url.includes('pageToken=next'));return response({items:[{id:'2'}]});});assert.equal((await c.events('a@b','2026-01-01','2027-01-01')).length,2);});
test('duplicate retry recovers the same insert without creating a new ID',async()=>{let calls=[];const c=client(async(url,options)=>{calls.push(options.method);return options.method==='POST'?response({},409):response({...eventPayload(record),id:record.id});});assert.equal((await c.insert('cal',record)).id,record.id);assert.deepEqual(calls,['POST','GET']);});
test('same ID with different content is not silently accepted',async()=>{const c=client(async(u,o)=>o.method==='POST'?response({},409):response({...eventPayload(record),description:'different'}));await assert.rejects(()=>c.insert('cal',record),/内容が異なります/);});
test('etag updates reject concurrent modification',async()=>{const c=client(async(u,o)=>{assert.equal(o.headers['If-Match'],'"v1"');assert.equal(o.method,'PATCH');return response({},412);});await assert.rejects(()=>c.update('cal',record),/他の端末/);});
test('delete requires explicit owned event and protects foreign events',async()=>{let called=false;const c=client(async()=>{called=true;return response(null,204);});assert.throws(()=>c.remove('cal',{...record,owned:false}),/削除できません/);assert.equal(called,false);await c.remove('cal',record);assert.equal(called,true);});
test('expired tokens are cleared and network errors remain actionable',async()=>{const c=client(async()=>response({},401));await assert.rejects(()=>c.events('cal','2026-01-01','2027-01-01'),/有効期限/);assert.equal(c.connected,false);assert.equal(c.token,null);const offline=client(async()=>{throw Error('offline');});await assert.rejects(()=>offline.insert('cal',record),/入力内容は保持/);});

test('Calendar API reports a specific hint when API is disabled',async()=>{
 const c=client(async()=>response({error:{status:'PERMISSION_DENIED',errors:[{reason:'accessNotConfigured'}]}},403));
 await assert.rejects(()=>c.calendars(),/Calendar APIを有効/);
});
test('Calendar API reports insufficient permissions separately',async()=>{
 const c=client(async()=>response({error:{errors:[{reason:'insufficientPermissions'}]}},403));
 await assert.rejects(()=>c.calendars(),/権限/);
});
test('GIS script loads once across concurrent initialization calls',async()=>{
 const originalDocument=globalThis.document;
 const originalGoogle=globalThis.google;
 let loadedScript=null,count=0;
 globalThis.google=undefined;
 globalThis.document={
  querySelector:()=>null,
  createElement:()=>({}),
  head:{append(script){loadedScript=script;count++;}}
 };
 try{
  const c=new CalendarClient();
  const first=c.loadIdentity(),second=c.loadIdentity();
  assert.equal(count,1);
  assert.equal(first instanceof Promise,true);
  globalThis.google={accounts:{oauth2:{}}};
  loadedScript.onload();
  await Promise.all([first,second]);
  await c.loadIdentity();
  assert.equal(count,1);
 }finally{
  globalThis.document=originalDocument;
  globalThis.google=originalGoogle;
 }
});
