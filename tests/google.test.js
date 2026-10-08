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
