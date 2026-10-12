import test from 'node:test';
import assert from 'node:assert/strict';
import {createMenuRequest} from '../src/ai-menu.js';

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
 assert.match(prompt,/candidatesから除外済み/);
 assert.match(prompt,/lockedは同じ日に必ず含めて/);
 assert.match(prompt,/前回と違うもの/);
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
 assert.match(prompt,/前回と違うもの/);
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
  assert.deepEqual(request.candidates.map(d=>d.name),['8日前の料理','未調理の料理']);
  const payload=JSON.parse(request.prompt.split('データ:\n')[1]);
  assert.deepEqual(payload.candidates.map(d=>d.name),['8日前の料理','未調理の料理']);
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
