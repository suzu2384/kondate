import test from 'node:test';
import assert from 'node:assert/strict';
import {createMenuRequest,validateMenuQuality,rememberMenuSuggestions,similarDishNames,AI_MODEL_CANDIDATE_LIMIT} from '../src/ai-menu.js';

const dishes=[
 {name:'定番の鮭焼き',category:'main',lastDate:'2026-10-01',count:32,protein:'魚',method:'焼く',genre:'和食'},
 {name:'肉じゃが',category:'main',lastDate:'2026-08-01',count:21,protein:'肉',method:'煮る',genre:'和食'},
 {name:'昔の料理',category:'main',lastDate:'2025-02-02',count:1,protein:'肉',method:'煮る',genre:'和食'},
 {name:'未調理の候補',category:'main',lastDate:null,count:0}
];
const rules={days:3,counts:{main:1},preferOld:true,oldDays:30,excludeRecent:true,
 recentDays:7,balance:true,unique:true,newMain:false};
const context={master:dishes,rules,previous:[
 {dishes:[{name:'定番の鮭焼き',category:'main',locked:true},{name:'昔の料理',category:'main'}]},
 {dishes:[{name:'肉じゃが',category:'main',locked:false},{name:'肉じゃが',category:'main',locked:false}]},
 {dishes:[{name:'未調理の候補',category:'main',locked:false}]}
]};

test('AI prompt is concise, varies draft, and relies on prefiltered candidates',()=>{
 const prompt=createMenuRequest(context).prompt;
 assert.match(prompt,/days配列は必ず3日分/);
 assert.match(prompt,/候補から除外済み/);
 assert.match(prompt,/lockedは同じ日に必ず含めて/);
 assert.match(prompt,/前回から献立全体を大きく変える/);
 assert.ok(prompt.split('\n').length<16);
});
test('previous draft names are hints to vary regeneration, not mandatory exclusions',()=>{
 const prompt=createMenuRequest(context).prompt;
 const payload=JSON.parse(prompt.slice(prompt.indexOf('データ:\n')+'データ:\n'.length));
 assert.deepEqual(payload.previousSuggested,['昔の料理','肉じゃが','未調理の候補']);
 assert.deepEqual(payload.locked,[{day:1,dishes:[{name:'定番の鮭焼き',category:'main'}]}]);
 assert.equal(payload.preferOld,true);
 assert.equal(payload.excludeRecent,true);
 assert.equal(payload.recentDays,7);
 assert.equal(payload.counts.main,1);
 assert.match(prompt,/前回から献立全体を大きく変える/);
 assert.doesNotMatch(prompt,/直前の生成案は必ず除外/);
});

test('absence of previous draft and disabled age preference do not force oldest dish selection',()=>{
 const prompt=createMenuRequest({...context,previous:[],rules:{...rules,preferOld:false,excludeRecent:false}}).prompt;
 const payload=JSON.parse(prompt.slice(prompt.indexOf('データ:\n')+'データ:\n'.length));
 assert.deepEqual(payload.previousSuggested,[]);
 assert.equal(payload.preferOld,false);
 assert.equal(payload.excludeRecent,false);
 assert.match(prompt,/除外済み/);
});

test('new diversity hints never include raw events, locations, metadata or credentials',()=>{
 const enriched={...context,master:[{...dishes[0],location:'自宅の住所',accessToken:'secret-example',raw:{description:'個人の予定'}},...dishes.slice(1)],
  previous:[{dishes:[{name:'前の献立',category:'main',locked:false,location:'個人情報',token:'secret-other'}]}]};
 const prompt=createMenuRequest(enriched).prompt;
 assert.match(prompt,/前の献立/);
 for(const secret of ['自宅の住所','secret-example','個人の予定','個人情報','secret-other'])
  assert.doesNotMatch(prompt,new RegExp(secret));
});

test('recent meals are excluded in both first and subsequent AI requests',()=>{
 const p={...context,referenceDate:'2026-10-12',previous:[],master:[
  {name:'昨日の料理',category:'main',lastDate:'2026-10-11',count:12},
  {name:'7日前の料理',category:'main',lastDate:'2026-10-05',count:9},
  {name:'8日前の料理',category:'main',lastDate:'2026-10-04',count:7},
  {name:'未調理の料理',category:'main',lastDate:null,count:0}
 ]};
 for(const prev of [[],[{dishes:[{name:'8日前の料理',category:'main',locked:false}]}]]){
  const request=createMenuRequest({...p,previous:prev});
  assert.deepEqual(request.candidates.map(d=>d.name),['未調理の料理','8日前の料理']);
  const payload=JSON.parse(request.prompt.split('データ:\n')[1]);
  assert.deepEqual(payload.candidates.map(d=>d.name),['未調理の料理','8日前の料理']);
 }
 assert.equal(createMenuRequest({...p,rules:{...rules,excludeRecent:false}}).candidates.length,4);
});
test('fixed recently cooked dishes remain listed as exceptions only',()=>{
 const p={...context,referenceDate:'2026-10-12',master:[
  {name:'昨日の料理',category:'main',lastDate:'2026-10-11',count:2},
  {name:'古い料理',category:'main',lastDate:'2026-09-10',count:2}
 ],previous:[{dishes:[{name:'昨日の料理',category:'main',locked:true}]}]};
 const result=createMenuRequest(p);
 assert.deepEqual(result.candidates.map(d=>d.name),['古い料理','昨日の料理']);
 assert.deepEqual(JSON.parse(result.prompt.split('データ:\n')[1]).locked,[{day:1,dishes:[{name:'昨日の料理',category:'main'}]}]);
});

test('160 recipe limit considers the full catalog and prioritizes old meals',()=>{
 const master=Array.from({length:250},(_,i)=>({
  name:'料理'+i,category:'main',lastDate:i<200?'2026-10-09':'2024-02-01',
  count:i+1,protein:['肉','魚','野菜・豆','卵'][i%4],
  method:['焼く','煮る','炒める','蒸す'][i%4]
 }));
 const r=createMenuRequest({master,referenceDate:'2026-10-12',rules:{...rules,days:7,recentDays:1},previous:[]});
 assert.equal(r.candidates.length,AI_MODEL_CANDIDATE_LIMIT);
 assert.ok(r.candidates.some(d=>d.name==='料理200'));
 assert.ok(r.candidates.slice(0,50).every(d=>d.lastDate==='2024-02-01'));
});
test('candidate allocation respects requested meal categories',()=>{
 const master=[
  ...Array.from({length:210},(_,i)=>({name:'主菜'+i,category:'main',lastDate:'2024-02-01'})),
  ...Array.from({length:210},(_,i)=>({name:'汁物'+i,category:'soup',lastDate:'2024-02-01'}))
 ];
 const req=createMenuRequest({master,referenceDate:'2026-10-12',rules:{...rules,days:7,counts:{main:1,soup:1}},previous:[]});
 assert.equal(req.candidates.length,160);
 assert.equal(req.candidates.filter(d=>d.category==='main').length,80);
 assert.equal(req.candidates.filter(d=>d.category==='soup').length,80);
});
test('previous suggestions rank below unused recipes without being forbidden',()=>{
 const master=[
  {name:'古め',category:'main',lastDate:'2026-07-01',count:1},
  {name:'前回の献立',category:'main',lastDate:'2025-01-01',count:1}
 ];
 const c={master,rules:{...rules,days:2,oldDays:30},referenceDate:'2026-10-12',previous:[],recentSuggested:['前回の献立']};
 const req=createMenuRequest(c);
 assert.deepEqual(req.candidates.map(d=>d.name),['古め','前回の献立']);
 assert.match(req.prompt,/"oldDays":30/);
 assert.match(req.prompt,/"recentSuggested":\["前回の献立"\]/);
});
test('seven-day prompt template contains all seven complete day slots',()=>{
 const req=createMenuRequest({master:dishes,referenceDate:'2026-10-12',rules:{...rules,days:7},previous:[]});
 const line=req.prompt.split('\n').find(l=>l.startsWith('返答形式（'));
 assert.ok(line);
 const format=JSON.parse(line.slice(line.indexOf(': ')+2));
 assert.equal(format.days.length,7);
 assert.ok(format.days.every(day=>day.dishes.length===1));
});
test('recent suggestions are retained for multiple generations and do not include locks',()=>{
 const plan=names=>[{dishes:names.map(name=>({name,category:'main'}))}];
 const a=rememberMenuSuggestions([],plan(['肉じゃが','カレー']));
 const b=rememberMenuSuggestions(a,plan(['焼き魚','肉じゃが']));
 assert.deepEqual(b,['カレー','焼き魚','肉じゃが']);
 assert.deepEqual(rememberMenuSuggestions(b,[{dishes:[{name:'固定',locked:true}]}]),b);
});
test('similar original-main names are recognized',()=>{
 assert.equal(similarDishNames('鶏もも肉とキャベツの塩炒め','鶏肉とキャベツの塩炒め'),true);
 assert.equal(similarDishNames('鮭の塩焼き','肉じゃが'),false);
});
test('unchanged drafts fail quality checks only when unused alternatives exist',()=>{
 const master=Array.from({length:18},(_,i)=>({name:'料理'+i,category:'main',lastDate:'2025-01-01'}));
 const previous=Array.from({length:7},(_,i)=>({dishes:[{name:'料理'+i,category:'main'}]}));
 const ctx={master,rules:{...rules,days:7},previous,referenceDate:'2026-10-12'};
 const repeat=Array.from({length:7},(_,i)=>({dishes:[{name:'料理'+(i<5?i:i+7),category:'main'}]}));
 assert.match(validateMenuQuality(repeat,ctx).join(''),/ほぼ同じ料理/);
 const different=Array.from({length:7},(_,i)=>({dishes:[{name:'料理'+(i+7),category:'main'}]}));
 assert.deepEqual(validateMenuQuality(different,ctx),[]);
 assert.deepEqual(validateMenuQuality(repeat,{...ctx,master:master.slice(0,7)}),[]);
});
test('excessive identical main ingredient-method pairs are rejected when diverse',()=>{
 const master=Array.from({length:12},(_,i)=>({name:'料理'+i,category:'main',
  protein:['肉','魚','野菜・豆','卵'][i%4],method:['焼く','煮る','炒める','蒸す'][i%4]}));
 const plan=Array.from({length:7},(_,i)=>({dishes:[{name:'料理'+i,category:'main',protein:'肉',method:'焼く'}]}));
 const ctx={master,rules:{...rules,days:7},previous:[]};
 assert.match(validateMenuQuality(plan,ctx).join(''),/同じ食材・調理法/);
 assert.deepEqual(validateMenuQuality(plan,{...ctx,master:master.slice(0,3)}),[]);
});
