import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FamilySync,diffSnapshots,obsoleteSharedJournalRanges} from '../src/family-share.js';
import {shoppingSharedSnapshot,applyShoppingEvents} from '../src/family-data.js';

const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
const fake=()=>({
 connected:true,files:new Map(),cleared:[],
 async create(kind){const id='abcdefghijklmnop123456';this.files.set(id,[['kondate-shared-v1',kind]]);return id;},
 async appendRows(id,rows){this.files.get(id).push(...rows);},
 async readRows(id,start=1){return this.files.get(id).slice(start-1).map(row=>[...row]);},
 async clearObsoleteJournalValues(id,ranges){
  this.cleared.push(...ranges);
  for(const range of ranges){
   const m=/^Ops!B(\d+):B(\d+)$/.exec(range);
   assert.ok(m);
   for(let i=+m[1];i<=+m[2];i++)this.files.get(id)[i-1][1]='';
  }
 }
});

test('obsolete snapshots remove checked/excluded flags for removed ingredients',()=>{
 const old={
  servings:1,selected:['カレー'],manual:[],checked:{'auto:じゃがいも|g':'g:200','auto:牛乳|ml':'ml:1000'},
  excluded:{'auto:牛乳|ml':true,'auto:じゃがいも|g':true}
 };
 const active=[{id:'auto:じゃがいも|g',kind:'auto',name:'じゃがいも',baseUnit:'g',baseQuantity:200,sourceNames:['カレー']}];
 const snapshot=shoppingSharedSnapshot(old,active,{pruneStale:true});
 assert.equal(snapshot['checked:auto:じゃがいも|g'],'g:200');
 assert.equal(snapshot['excluded:auto:じゃがいも|g'],true);
 assert.equal(snapshot['checked:auto:牛乳|ml'],undefined);
 assert.equal(snapshot['excluded:auto:牛乳|ml'],undefined);
 const deletions=diffSnapshots(shoppingSharedSnapshot(old),snapshot,'shopping',()=> 'operation-12345678');
 assert.deepEqual(deletions.map(x=>x.key).sort(),['checked:auto:牛乳|ml','excluded:auto:牛乳|ml']);
});

test('cleanup clears historical JSON values but leaves row IDs and latest deletion markers intact',async()=>{
 const client=fake(),owner=new FamilySync(client,memory());
 const initial={'servings':1,'selected:カレー':'カレー'};
 const id=await owner.start('shopping',initial,'');
 const entry=owner.entry('shopping');
 const prior={...initial,'checked:auto:牛乳|ml':'ml:1000'};
 const newer={'servings':2,'selected:カレー':'カレー','checked:auto:牛乳|ml':'ml:1000'};
 const final={'servings':2,'selected:カレー':'カレー'};
 for(const snapshot of [prior,newer,final]){
  owner.observe('shopping',snapshot);
  await owner.sync('shopping',async()=>{});
  await owner.sync('shopping',async()=>{});
 }
 const original=client.files.get(id);
 const totalRows=original.length;
 assert.ok(original.some(row=>String(row[1]||'').includes('ml:1000')));
 const cursor=entry.cursor;
 const removed=await owner.compact('shopping',{force:true});
 assert.ok(removed.clearedRanges>0);
 const rows=client.files.get(id);
 assert.equal(rows.length,totalRows);
 assert.deepEqual(rows.map(row=>row[0]),original.map(row=>row[0]));
 assert.equal(rows.some(row=>String(row[1]||'').includes('ml:1000')),false);
 assert.equal(rows.at(-1)[1]?.includes('"value":null'),true);
 assert.ok(rows.slice(1,-1).some(row=>row[1]===''));
 assert.equal(entry.cursor,cursor);
 const late=new FamilySync(client,memory());
 const received=[];
 await late.join('shopping',id,async ops=>received.push(...ops));
 assert.deepEqual(applyShoppingEvents({},received,true).selected,['カレー']);
 assert.equal(applyShoppingEvents({},received,true).servings,2);
 assert.deepEqual(applyShoppingEvents({},received,true).checked,{});
});

test('offline collaborator catches up after cleanup even when old row payloads are blank',async()=>{
 const client=fake(),a=new FamilySync(client,memory()),b=new FamilySync(client,memory());
 const id=await a.start('shopping',{'servings':1,'selected:カレー':'カレー'},'');
 let received=[];
 await b.join('shopping',id,async ops=>{received=ops;});
 let remote=applyShoppingEvents({},received,true);
 for(const snap of [
  {'servings':1,'selected:カレー':'カレー','selected:シチュー':'シチュー'},
  {'servings':1,'selected:カレー':'カレー'},
  {'servings':3,'selected:カレー':'カレー'}
 ]){
  a.observe('shopping',snap);
  await a.sync('shopping',async()=>{});
  await a.sync('shopping',async()=>{});
 }
 await a.compact('shopping',{force:true});
 await b.sync('shopping',async ops=>{remote=applyShoppingEvents(remote,ops,false);});
 assert.deepEqual(remote.selected,['カレー']);
 assert.equal(remote.servings,3);
});

test('owner-only maintenance is throttled and cannot clear unacknowledged writes',async()=>{
 const client=fake(),owner=new FamilySync(client,memory()),other=new FamilySync(client,memory());
 const id=await owner.start('shopping',{'servings':1},'');
 await other.join('shopping',id,async()=>{});
 owner.observe('shopping',{'servings':2});
 assert.equal((await owner.compact('shopping',{force:true})).skipped,true);
 await owner.sync('shopping',async()=>{});
 await owner.sync('shopping',async()=>{});
 assert.equal((await other.compact('shopping',{force:true})).skipped,true);
 const first=await owner.compact('shopping');
 assert.equal(first.skipped,false);
 const second=await owner.compact('shopping');
 assert.equal(second.skipped,true);
});

test('repeated operation IDs cause cleanup to conservatively skip',()=>{
 const op={id:'repeated-123456',kind:'shopping',key:'servings',at:12345,value:2};
 const rows=[['kondate-shared-v1','shopping'],[op.id,JSON.stringify(op)],[op.id,JSON.stringify(op)]];
 assert.deepEqual(obsoleteSharedJournalRanges(rows,'shopping'),[]);
});

test('cleanup leaves IDs so Sheets append uses a continuous logical table',()=>{
 const app=readFileSync(new URL('../src/family-share.js',import.meta.url),'utf8');
 assert.match(app,/Ops!B.*:B/);
 assert.match(app,/values:batchClear/);
 assert.match(app,/d\.owner|entry\.owner/);
});
