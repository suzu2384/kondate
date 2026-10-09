import test from 'node:test';
import assert from 'node:assert/strict';
import {CalendarClient} from '../src/google.js';
const reply=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
const dish={name:'唐揚げ',category:'main'};
test('new Google Calendar records save location in the native location field',async()=>{
 const client=new CalendarClient(async(url,opt)=>{
  assert.equal(opt.method,'POST');
  const body=JSON.parse(opt.body);
  assert.equal(body.location,'お食事処');
  return reply({...body,id:'saved-id'});
 });
 client.token='test';client.expires=Date.now()+120000;
 const result=await client.insert('main-cal',{id:'event-id',status:'actual',date:'2026-10-09',location:'お食事処',dishes:[dish]});
 assert.equal(result.location,'お食事処');
});
test('editing a legacy Calendar event preserves its time and updates its location',async()=>{
 const old={id:'existing',summary:'昼食：唐揚げ',location:'前のお店',start:{dateTime:'2026-10-09T12:00:00+09:00'},end:{dateTime:'2026-10-09T13:00:00+09:00'},etag:'"old"',extendedProperties:{private:{unrelated:'keep'}}};
 const client=new CalendarClient(async(url,opt)=>{
  const body=JSON.parse(opt.body);
  assert.equal(opt.method,'PATCH');
  assert.equal(body.location,'新しいお店');
  assert.equal(body.start,undefined);
  assert.equal(body.end,undefined);
  assert.equal(body.extendedProperties.private.unrelated,'keep');
  return reply({...old,...body});
 });
 client.token='test';client.expires=Date.now()+120000;
 const result=await client.update('main-cal',{id:'existing',date:'2026-10-09',status:'actual',owned:false,etag:'"old"',raw:old,location:'新しいお店',dishes:[dish]});
 assert.equal(result.location,'新しいお店');
});
test('clearing an existing location sends an empty location instead of preserving the old restaurant',async()=>{
 const client=new CalendarClient(async(url,opt)=>{
  assert.equal(JSON.parse(opt.body).location,'');
  return reply({id:'existing',location:''});
 });
 client.token='test';client.expires=Date.now()+120000;
 await client.update('main-cal',{id:'existing',date:'2026-10-09',status:'actual',owned:false,etag:'"old"',raw:{},location:' ',dishes:[dish]});
});
