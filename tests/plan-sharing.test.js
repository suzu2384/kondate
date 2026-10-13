import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planSharedSnapshot,applyPlanEvents} from '../src/family-data.js';
import {FamilySync,SHARED_KINDS,diffSnapshots,validateSharedOp,ownedShareQuery} from '../src/family-share.js';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const provider=()=>({
 connected:true,files:new Map(),invites:[],
 async create(kind){const id='sharedplan1234567890';this.files.set(id,[['kondate-shared-v1',kind]]);return id;},
 async appendRows(id,rows){this.files.get(id).push(...rows);},
 async readRows(id,start=1){return this.files.get(id).slice(start-1);},
 async invite(id,email){this.invites.push({id,email});}
});
const sample=[
 {id:'day-0',dishes:[{name:'サバの味噌煮',category:'main',protein:'魚',locked:true,isNew:false,
  count:40,lastDate:'2026-10-01',location:'自宅',secretToken:'secret'}]},
 {id:'day-1',dishes:[{name:'カレー',category:'main',locked:false,isNew:true}]}
];

test('a menu-only snapshot preserves order and locks, never exposing personal calendar history',()=>{
 assert.ok(SHARED_KINDS.includes('plan'));
 const saved=planSharedSnapshot(sample);
 assert.equal(saved.length,2);
 assert.deepEqual(saved['day:0'].dishes.map(d=>d.name),['サバの味噌煮']);
 assert.equal(saved['day:0'].dishes[0].locked,true);
 assert.equal(saved['day:1'].dishes[0].isNew,true);
 for(const privateField of ['lastDate','location','secretToken','2026-10-01','count'])
  assert.equal(JSON.stringify(saved).includes(privateField),false,privateField);
 assert.equal(ownedShareQuery('plan').includes('共有献立'),true);
 const categorized=planSharedSnapshot(sample,[{id:'main',name:'主菜'}]);
 assert.equal(categorized['day:0'].dishes[0].categoryName,'主菜');
 assert.equal(applyPlanEvents([],diffSnapshots({},categorized,'plan',()=> 'cat-plan-123456'),true)[0].dishes[0].categoryName,'主菜');
});

test('joining a shared meal plan replaces the local draft and preserves dish flags',()=>{
 const ops=diffSnapshots({},planSharedSnapshot(sample),'plan',()=> 'meal-share-12345');
 for(const op of ops)assert.doesNotThrow(()=>validateSharedOp(op,'plan'));
 const joined=applyPlanEvents([{id:'private',dishes:[{name:'旧献立',category:'main'}]}],ops,true);
 assert.equal(joined.length,2);
 assert.equal(joined[0].dishes[0].name,'サバの味噌煮');
 assert.equal(joined[0].dishes[0].locked,true);
 assert.equal(joined[1].dishes[0].isNew,true);
});

test('independent changes to different days travel as independent keys',()=>{
 const baseline=planSharedSnapshot(sample);
 const first=structuredClone(sample),second=structuredClone(sample);
 first[0].dishes[0].name='さばの味噌煮';
 second[1].dishes[0].name='ハヤシライス';
 const a=diffSnapshots(baseline,planSharedSnapshot(first),'plan',()=> 'change-plan-123456');
 const b=diffSnapshots(baseline,planSharedSnapshot(second),'plan',()=> 'other-plan-123456');
 assert.deepEqual(a.map(x=>x.key),['day:0']);
 assert.deepEqual(b.map(x=>x.key),['day:1']);
 const both=applyPlanEvents(sample,[...a,...b]);
 assert.deepEqual(both.map(day=>day.dishes[0].name),['さばの味噌煮','ハヤシライス']);
});

test('reducing days removes trailing content instead of retaining stale meals',()=>{
 const before=planSharedSnapshot(sample);
 const after=planSharedSnapshot(sample.slice(0,1));
 const ops=diffSnapshots(before,after,'plan',()=> 'removed-1234567');
 assert.ok(ops.some(x=>x.key==='length'&&x.value===1));
 assert.ok(ops.some(x=>x.key==='day:1'&&x.value===null));
 assert.equal(applyPlanEvents(sample,ops).length,1);
 assert.deepEqual(applyPlanEvents(sample,[{key:'length',value:0}]),[]);
});

test('malformed or excessive meal data is rejected without changing the draft',()=>{
 const original=structuredClone(sample);
 assert.throws(()=>applyPlanEvents(sample,[{key:'length',value:16}]),/日数/);
 assert.throws(()=>applyPlanEvents(sample,[{key:'day:0',value:{id:'day-0',dishes:[{name:'',category:'main'}]}}]),/料理名/);
 assert.throws(()=>applyPlanEvents(sample,[{key:'day:0',value:{dishes:[{name:'献立',category:'invalid category'}]}}]),/分類/);
 assert.throws(()=>validateSharedOp({id:'bad-plan-123456',kind:'plan',key:'api:token',at:Date.now(),value:'secret'},'plan'),/不正/);
 assert.deepEqual(sample,original);
});

test('owner and recipient synchronize new menus and later edits through the same spreadsheet',async()=>{
 const client=provider(),owner=new FamilySync(client,memory()),recipient=new FamilySync(client,memory());
 const id=await owner.start('plan',planSharedSnapshot(sample),'family@example.com');
 let recipientPlan=[];
 await recipient.join('plan',id,async(ops,opts)=>{
  recipientPlan=applyPlanEvents(recipientPlan,ops,opts.initial);
 });
 assert.deepEqual(recipientPlan.map(day=>day.dishes[0].name),['サバの味噌煮','カレー']);
 assert.equal(client.invites[0].email,'family@example.com');
 const edited=structuredClone(sample);
 edited[1].dishes[0].name='クリームシチュー';
 owner.observe('plan',planSharedSnapshot(edited));
 await owner.sync('plan',async()=>{});
 await owner.sync('plan',async()=>{});
 await recipient.sync('plan',async(ops,opts)=>{recipientPlan=applyPlanEvents(recipientPlan,ops,opts.initial);});
 assert.equal(recipientPlan[1].dishes[0].name,'クリームシチュー');
 assert.equal(owner.entry('plan').queue.length,0);
});

test('meal tab has share action and Sheets sync without requiring Calendar permissions',()=>{
 const app=file('src/app.js'),css=file('style.css');
 assert.match(app,/button\('共有','family-dialog','family-share-button mini generation-share-button','data-kind="plan"'/);
 assert.match(app,/button\('献立を共有','family-dialog','mini','data-kind="plan"'/);
 assert.match(app,/planSharedSnapshot\(state\.draft,state\.categories\)/);
 assert.match(app,/applyPlanEvents\(state\.draft,ops,initial\)/);
 assert.match(app,/type==='plan'&&tab==='generate'/);
 assert.match(css,/\.generation-screen \.generation-controls \.generation-share-button/);
});
