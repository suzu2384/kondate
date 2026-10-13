import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMenuRequest,parseMenuResponse,repairMenuSelections,validateMenuQuality} from '../src/ai-menu.js';
import {AIService} from '../src/ai.js';

const dishes=Array.from({length:35},(_,i)=>({
 name:'主菜候補'+i,category:'main',lastDate:'2025-01-01',count:i+1,
 protein:['肉','魚','野菜・豆','卵'][i%4],method:['煮る','焼く','炒める'][i%3],
 genre:['和食','洋食','中華'][i%3]
}));
const menu=names=>names.map((name,i)=>({id:'day-'+i,dishes:[{
 name,category:'main',locked:false,isNew:false
}]}));
const context={
 master:dishes,
 rules:{days:7,counts:{main:1},unique:true,excludeRecent:true,recentDays:7,
  preferOld:false,oldDays:30,balance:false,newMain:false},
 previous:menu(dishes.slice(0,7).map(d=>d.name)),
 referenceDate:'2026-10-14'
};

test('same seed always creates the same AI pool, while changing seed rotates lottery results',()=>{
 const pools=[];
 for(let seed=0;seed<30;seed++){
  const one=createMenuRequest({...context,selectionSeed:seed});
  const two=createMenuRequest({...context,selectionSeed:seed});
  assert.deepEqual(one.candidates,two.candidates);
  assert.equal(one.prompt,two.prompt);
  const names=new Set(one.candidates.map(d=>d.name));
  assert.ok(one.candidates.length>=context.rules.days);
  assert.ok(one.candidates.length<=dishes.length);
  pools.push(dishes.slice(0,7).filter(d=>names.has(d.name)).map(d=>d.name).join(','));
 }
 assert.ok(new Set(pools).size>1,'Fresh generations can contain different previous dishes');
 assert.ok(pools.some(v=>v.split(',').filter(Boolean).length<7),'Prior choices are held back individually');
});

test('previous dish exclusion odds decay to zero for the final eligible dish',()=>{
 const text=readFileSync(new URL('../src/ai-menu.js',import.meta.url),'utf8');
 assert.match(text,/previousCount<=1\?0:0\.7\*\(1-draw\/\(previousCount-1\)\)/);
 assert.match(text,/draw\+\+;/);
 const probabilities=n=>Array.from({length:n},(_,i)=>n===1?0:0.7*(1-i/(n-1)));
 assert.deepEqual(probabilities(1),[0]);
 assert.equal(probabilities(7)[0],0.7);
 assert.equal(probabilities(7)[6],0);
 assert.ok(probabilities(7).every((p,i,a)=>i===0||p<=a[i-1]));
});

test('lottery never removes locked items and does not deplete a limited category',()=>{
 const sparse={...context,master:dishes.slice(0,7)};
 const chosen=createMenuRequest({...sparse,selectionSeed:1234}).candidates;
 assert.deepEqual(new Set(chosen.map(d=>d.name)),new Set(sparse.master.map(d=>d.name)));
 const fixed={...context,previous:menu(dishes.slice(0,7).map(d=>d.name))};
 fixed.previous[0].dishes[0].locked=true;
 for(let seed=0;seed<40;seed++){
  const requested=createMenuRequest({...fixed,selectionSeed:seed});
  assert.ok(requested.candidates.some(d=>d.name===fixed.previous[0].dishes[0].name));
  assert.equal(JSON.parse(requested.prompt.split('データ:\n')[1]).locked[0].dishes[0].name,
   fixed.previous[0].dishes[0].name);
 }
});

test('quality repair replaces repeated past choices with eligible unused dishes',async()=>{
 const repeated=menu(dishes.slice(0,7).map(d=>d.name));
 const sampled={...context,selectionSeed:111};
 const plan=parseMenuResponse(JSON.stringify({days:repeated.map(d=>({dishes:d.dishes}))}),sampled);
 const replacements=repairMenuSelections(plan,sampled);
 assert.ok(replacements>=1);
 assert.deepEqual(validateMenuQuality(plan,context),[]);
 assert.equal(new Set(plan.flatMap(d=>d.dishes.map(x=>x.name))).size,7);
 assert.ok(plan.flatMap(d=>d.dishes).every(d=>d.category==='main'));
 const service=new AIService({generate:async()=>plan});
 assert.equal((await service.generate(context)).length,7);
});

test('repair keeps locked dishes and AI-original main unchanged',()=>{
 const previous=menu(dishes.slice(0,7).map(d=>d.name));
 previous[0].dishes[0].locked=true;
 const ctx={...context,rules:{...context.rules,newMain:true},previous,selectionSeed:451};
 const originalNew='新しいサバの香味蒸し';
 const submitted=previous.map((day,i)=>({dishes:[i===6?
  {name:originalNew,category:'main',new:true}:
  {name:day.dishes[0].name,category:'main'}]}));
 const plan=parseMenuResponse(JSON.stringify({days:submitted}),ctx);
 const replaced=repairMenuSelections(plan,ctx);
 assert.ok(replaced>=1);
 assert.equal(plan[0].dishes[0].name,previous[0].dishes[0].name);
 assert.equal(plan[6].dishes[0].name,originalNew);
 assert.equal(plan[6].dishes[0].isNew,true);
 assert.equal(plan.filter(day=>day.dishes.some(x=>x.isNew)).length,1);
});

test('recently cooked recipes remain excluded even during the local repair',()=>{
 const master=dishes.map((d,i)=>i===7?{...d,lastDate:'2026-10-13'}:d);
 const ctx={...context,master,selectionSeed:32};
 const plan=menu(dishes.slice(0,7).map(d=>d.name));
 repairMenuSelections(plan,ctx);
 assert.equal(plan.flatMap(x=>x.dishes).some(d=>d.name===dishes[7].name),false);
});

test('the lottery never expands AI inputs to calendar events or private fields',()=>{
 const ctx={...context,selectionSeed:19,master:dishes.map((d,i)=>({
  ...d,location:'秘密の場所',authToken:'secret-token',raw:{description:'private-event'},id:i
 }))};
 const prompt=createMenuRequest(ctx).prompt;
 assert.doesNotMatch(prompt,/秘密の場所|secret-token|private-event|authToken|location/);
 assert.match(prompt,/candidates/);
});
