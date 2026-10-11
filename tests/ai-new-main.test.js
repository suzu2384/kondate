import test from 'node:test';
import assert from 'node:assert/strict';
import {createMenuRequest,parseMenuResponse} from '../src/ai-menu.js';
import {AIService} from '../src/ai.js';

const master=[
 {name:'カレー',category:'main',count:12,lastDate:'2026-09-01'},
 {name:'肉じゃが',category:'main',count:0},
 {name:'味噌汁',category:'soup',count:4}
];
const base={
 master,
 rules:{days:2,counts:{main:1,soup:1},newMain:true,unique:true,excludeRecent:false,recentDays:7},
 previous:[{id:'day-fixed',dishes:[{name:'カレー',category:'main',locked:true}]}]
};
const existing=(name,category)=>({name,category});
const newMain=(name='柚子香る鶏肉とれんこんの照り煮')=>({name,category:'main',new:true,protein:'肉',method:'煮る',genre:'和食'});
const response=(one,two)=>JSON.stringify({days:[{dishes:one},{dishes:two}]});
const good=response([existing('カレー','main'),existing('味噌汁','soup')],
 [newMain(),existing('味噌汁','soup')]);

test('AI prompt explicitly asks for one original main dish, with existing categories constrained',()=>{
 const {prompt}=createMenuRequest(base);
 assert.match(prompt,/newMain=trueの場合/);
 assert.match(prompt,/必ずちょうど1品提案/);
 assert.match(prompt,/new:true/);
 assert.match(prompt,/主菜以外や2品目以降に新しい料理を作らない/);
});

test('AI can propose a dish not in the master, without first registering it',async()=>{
 const context={...base,rules:{...base.rules,unique:false}};
 const plan=parseMenuResponse(good,context);
 assert.deepEqual(plan.map(x=>x.id),['day-fixed','day-1']);
 assert.equal(plan[1].dishes[0].name,'柚子香る鶏肉とれんこんの照り煮');
 assert.equal(plan[1].dishes[0].method,'煮る');
 assert.equal(plan[1].dishes[0].category,'main');
 const service=new AIService({generate:async()=>plan});
 const checked=await service.generate(context);
 assert.equal(checked[0].dishes[0].locked,true);
 assert.equal(checked[1].dishes[0].name,'柚子香る鶏肉とれんこんの照り煮');
});

test('untried dishes already in the master do not qualify as AI-original',()=>{
 const noOriginal=response([existing('カレー','main'),existing('味噌汁','soup')],
 [existing('肉じゃが','main'),existing('味噌汁','soup')]);
 assert.throws(()=>parseMenuResponse(noOriginal,base),/新しい主菜を提案できませんでした/);
 const service=new AIService({generate:async()=>[
  {dishes:[existing('カレー','main'),existing('味噌汁','soup')]},
  {dishes:[existing('肉じゃが','main'),existing('味噌汁','soup')]}
 ]});
 return assert.rejects(service.generate({...base,rules:{...base.rules,unique:false}}),/新しい主菜を提案できませんでした/);
});

test('new secondary dishes and unmarked unknown main dishes are not silently accepted',()=>{
 const badSide=response([existing('カレー','main'),existing('味噌汁','soup')],
 [newMain(),{name:'AI創作スープ',category:'soup',new:true}]);
 assert.throws(()=>parseMenuResponse(badSide,base),/登録候補にない/);
 const unmarked=response([existing('カレー','main'),existing('味噌汁','soup')],
 [{name:'AI創作の鶏肉料理',category:'main'},existing('味噌汁','soup')]);
 assert.throws(()=>parseMenuResponse(unmarked,base),/登録候補にない/);
});

test('AI cannot mark a registered dish as new or invent two main dishes',()=>{
 const known=response([existing('カレー','main'),existing('味噌汁','soup')],
 [{name:'肉じゃが',category:'main',new:true},existing('味噌汁','soup')]);
 assert.throws(()=>parseMenuResponse(known,base),/登録候補/);
 const twoNew=response([newMain('新作主菜A'),existing('味噌汁','soup')],
 [newMain('新作主菜B'),existing('味噌汁','soup')]);
 assert.throws(()=>parseMenuResponse(twoNew,base),/新しい主菜を正しく/);
});

test('newMain disabled retains strict registered-candidate-only validation',()=>{
 const off={...base,rules:{...base.rules,newMain:false}};
 assert.doesNotThrow(()=>parseMenuResponse(response(
  [existing('カレー','main'),existing('味噌汁','soup')],
  [existing('肉じゃが','main'),existing('味噌汁','soup')]),off));
 assert.throws(()=>parseMenuResponse(good,off),/登録候補にない/);
 assert.match(createMenuRequest(off).prompt,/newMain=falseの場合は新しい料理を作らず/);
});

test('a novel name must not duplicate any historical candidate, even past the prompt limit',()=>{
 const extras=Array.from({length:165},(_,i)=>({name:'過去の料理'+i,category:'main',count:i+1}));
 const context={...base,master:[master[2],...extras,...master.slice(0,2)],rules:{...base.rules,unique:false}};
 const target=response([existing('過去の料理0','main'),existing('味噌汁','soup')],
 [{name:'肉じゃが',category:'main',new:true},existing('味噌汁','soup')]);
 assert.throws(()=>parseMenuResponse(target,context),/登録候補|正しく提案/);
 const hidden=response([existing('過去の料理0','main'),existing('味噌汁','soup')],
 [newMain('過去の料理164'),existing('味噌汁','soup')]);
 assert.throws(()=>parseMenuResponse(hidden,context),/新しい主菜を正しく/);
});

test('free main slot is required, while malformed metadata falls back to unknown',()=>{
 assert.throws(()=>createMenuRequest({...base,rules:{...base.rules,counts:{soup:1}}}),/主菜の品数を1以上/);
 const locked={...base,previous:[
  {dishes:[{name:'カレー',category:'main',locked:true}]},
  {dishes:[{name:'肉じゃが',category:'main',locked:true}]}
 ]};
 assert.throws(()=>createMenuRequest(locked),/主菜がすべて固定/);
 const incorrect=good.replace('"protein":"肉"','"protein":"未分類"');
 assert.equal(parseMenuResponse(incorrect,base)[1].dishes[0].protein,'不明');
 const tooLong='長'.repeat(101);
 assert.throws(()=>parseMenuResponse(good.replace('柚子香る鶏肉とれんこんの照り煮',tooLong),base),/新しい主菜を正しく/);
});
