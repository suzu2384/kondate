import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMaster,eventPayload,eventRecord,normalize,defaultRules,parseLegacy,legacyFingerprint,monthGridDates} from '../src/model.js';
import {generate,reroll,validatePlan} from '../src/generator.js';
import {catalog} from '../src/catalog.js';
import {AIService} from '../src/ai.js';
const ref='2026-10-08';
const rules={...defaultRules,counts:{main:1,side:1,soup:1}};
const master=buildMaster([],{}, {},catalog);
test('normalization unifies full-width and spaces, aliases aggregate confirmed records only',()=>{
 assert.equal(normalize(' Ａ　B '),'ab');
 const records=[{status:'actual',date:'2026-09-01',dishes:[{name:'ぎょうざ',category:'main'}]},{status:'actual',date:'2026-09-03',dishes:[{name:'餃子',category:'main'}]},{status:'plan',date:ref,dishes:[{name:'餃子'}]},{status:'unreviewed',date:ref,dishes:[{name:'餃子'}]}];
 const [d]=buildMaster(records,{'ぎょうざ':'餃子'});assert.equal(d.count,2);assert.equal(d.lastDate,'2026-09-03');assert.deepEqual(d.dates,['2026-09-03','2026-09-01']);
});
test('structured events round trip; plans do not become actuals; exclusive end date',()=>{
 const payload=eventPayload({date:'2026-12-31',status:'plan',dishes:[{name:'煮魚',category:'main'}]});assert.equal(payload.end.date,'2027-01-01');const r=eventRecord({...payload,id:'test',etag:'1'});assert.equal(r.status,'plan');assert.equal(r.dishes[0].name,'煮魚');assert.equal(buildMaster([r]).length,0);
});
test('external events stay unreviewed until local confirmation; originals unchanged',()=>{
 const e={id:'legacy',summary:'夕食：鮭、サラダ',start:{date:'2026-10-01'}};const original=JSON.stringify(e);assert.equal(eventRecord(e).status,'unreviewed');assert.equal(parseLegacy(e).length,2);assert.equal(eventRecord(e,{legacy:{accepted:true,source:legacyFingerprint(e),dishes:[{name:'鮭',category:'main'}]}}).status,'actual');assert.equal(JSON.stringify(e),original);
});
test('timestamp events use calendar timezone and invalid structured events stay protected',()=>{
 assert.equal(eventRecord({id:'x',summary:'夕食',start:{dateTime:'2026-10-01T18:00:00Z'}}).date,'2026-10-02');assert.equal(eventRecord({id:'x',start:{date:ref},extendedProperties:{private:{kondate:'1'}},description:'bad'}).status,'invalid');
});
test('7-day plan has 21 unique dishes, requested categories, no calendar dates',()=>{
 const result=generate(master,rules,[],ref,()=>.5);assert.equal(result.plan.length,7);assert.deepEqual(result.issues,[]);assert.equal(new Set(result.plan.flatMap(day=>day.dishes.map(d=>d.name))).size,21);for(const day of result.plan){assert.deepEqual(day.dishes.map(d=>d.category).sort(),['main','side','soup']);assert.equal(day.date,undefined);}
});
test('recent dishes excluded and old dishes preferred',()=>{
 const choices=[{name:'昨日',category:'main',lastDate:'2026-10-07',count:1},{name:'古い',category:'main',lastDate:'2026-08-01',count:1},{name:'中間',category:'main',lastDate:'2026-09-25',count:1}];const r=generate(choices,{...rules,days:1,newMain:false,counts:{main:1}},[],ref,()=>.5);assert.equal(r.plan[0].dishes[0].name,'古い');
});
test('insufficient candidates do not silently duplicate; explicit relaxation works',()=>{
 const choices=[{name:'A',category:'main',count:0}];const r=generate(choices,{...rules,days:3,counts:{main:1}},[],ref);assert.equal(r.plan.flatMap(d=>d.dishes).length,1);assert.ok(r.issues.length>=2);const relaxed=generate(choices,{...rules,days:3,unique:false,counts:{main:1}},[],ref);assert.equal(relaxed.plan.flatMap(d=>d.dishes).length,3);
});
test('locked dishes survive regeneration and reroll',()=>{
 const previous=[{dishes:[{name:'固定',category:'main',locked:true}]}];const r=generate(master,rules,previous,ref);assert.equal(r.plan[0].dishes[0].name,'固定');assert.equal(r.plan[0].dishes[0].locked,true);assert.equal(reroll(master,rules,r.plan,0,0,ref).dish.name,'固定');
});
test('reroll changes only selected dish without introducing duplicates',()=>{
 const r=generate(master,rules,[],ref);const snapshot=JSON.stringify(r.plan);const next=reroll(master,rules,r.plan,0,0,ref);assert.notEqual(next.dish.name,r.plan[0].dishes[0].name);assert.equal(JSON.stringify(r.plan),snapshot);r.plan[0].dishes[0]=next.dish;assert.deepEqual(validatePlan(r.plan,rules,master,ref),[]);
});
test('new main rule reports unavailable candidates and diversity changes selection',()=>{
 const allCooked=master.map(d=>({...d,count:1,lastDate:'2026-01-01'}));assert.ok(generate(allCooked,rules,[],ref).issues.some(s=>s.includes('未調理の主菜')));
 const candidates=[{name:'A',category:'main',protein:'肉'},{name:'B',category:'main',protein:'肉'},{name:'C',category:'main',protein:'魚'}];const r=generate(candidates,{...rules,days:2,newMain:false,counts:{main:1}},[],ref,()=>.5);assert.deepEqual(r.plan.map(d=>d.dishes[0].protein),['肉','魚']);
});
test('AI adapters reject invalid day count and duplicates, no provider necessary for rules',async()=>{
 assert.equal(new AIService().available,false);await assert.rejects(()=>new AIService({generate:async()=>[]}).generate({rules,master}),/日数/);const ai=new AIService({generate:async()=>Array.from({length:7},()=>({dishes:[{name:'重複',category:'main'}]}))});await assert.rejects(()=>ai.generate({rules,master}),/重複/);
});
test('untrusted event status and date cannot become raw UI attributes',()=>{
 const p=eventPayload({date:ref,dishes:[{name:'料理',category:'main'}]});p.extendedProperties.private.state='" onclick="bad';assert.equal(eventRecord({...p,id:'bad'}).status,'invalid');assert.equal(eventRecord({start:{date:'" onclick="bad'}}),null);
});
test('known catalog attributes enrich matching historical dishes',()=>{
 const result=buildMaster([{status:'actual',date:ref,dishes:[{name:'サバの味噌煮',category:'main',protein:'不明'}]}],{}, {},catalog);assert.equal(result.find(d=>d.name==='サバの味噌煮').protein,'魚');
});
test('AI cannot change fixed dishes',async()=>{
 const ai=new AIService({generate:async()=>[{dishes:[{name:'別の料理',category:'main'}]}]});await assert.rejects(()=>ai.generate({rules:{...rules,days:1,newMain:false,counts:{main:1}},master:[],previous:[{dishes:[{name:'固定料理',category:'main',locked:true}]}]}),/固定/);
});

test('external changes invalidate a previous import decision',()=>{const original={id:'x',summary:'カレー',start:{date:ref}};const legacy={x:{accepted:true,source:legacyFingerprint(original),dishes:[{name:'カレー',category:'main'}]}};assert.equal(eventRecord(original,legacy).status,'actual');const changed=eventRecord({...original,summary:'焼き魚'},legacy);assert.equal(changed.status,'unreviewed');assert.equal(changed.dishes[0].name,'焼き魚');});

test('month calendar always spans 6 rows, regardless of month length',()=>{
 for(const [year,month] of [[2026,1],[2026,9],[2026,7],[2027,1]]){
  const dates=monthGridDates(year,month);
  const prefix=`${year}-${String(month+1).padStart(2,'0')}-`;
  assert.equal(dates.length,42);
  assert.equal(new Date(`${dates[0]}T12:00:00`).getDay(),0);
  assert.equal(new Date(`${dates.at(-1)}T12:00:00`).getDay(),6);
  assert.equal(dates.filter(date=>date.startsWith(prefix)).length,new Date(year,month+1,0).getDate());
  assert.equal(new Set(dates).size,42);
 }
});
