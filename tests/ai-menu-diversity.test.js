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

test('AI menu prompt prioritizes history diversity rather than filling every slot with oldest',()=>{
 const req=createMenuRequest(context);
 assert.match(req.prompt,/最も古い料理や調理回数count=0の料理ばかりを並べない/);
 assert.match(req.prompt,/定番料理、ほどよく期間が空いた料理、久しぶりの料理を混ぜる/);
 assert.match(req.prompt,/preferOld=trueの場合、oldDays日以上作っていない料理も献立の一部で優先/);
 assert.match(req.prompt,/ただしそれだけで大半を占めない/);
 assert.match(req.prompt,/countが多い定番料理/);
 assert.match(req.prompt,/balance=trueなら/);
 assert.match(req.prompt,/excludeRecentがtrueなら/);
 assert.match(req.prompt,/lockedは絶対に維持する/);
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
 assert.match(prompt,/候補不足なら通常の料理のみ再利用してよい/);
 assert.doesNotMatch(prompt,/直前の生成案は必ず除外/);
});

test('absence of previous draft and disabled age preference do not force oldest dish selection',()=>{
 const prompt=createMenuRequest({...context,previous:[],rules:{...rules,preferOld:false,excludeRecent:false}}).prompt;
 const payload=JSON.parse(prompt.slice(prompt.indexOf('データ:\n')+'データ:\n'.length));
 assert.deepEqual(payload.previousSuggested,[]);
 assert.equal(payload.preferOld,false);
 assert.equal(payload.excludeRecent,false);
 assert.match(prompt,/preferOld=falseなら古さを優先条件にしない/);
});

test('new diversity hints never include raw events, locations, metadata or credentials',()=>{
 const enriched={...context,master:[{...dishes[0],location:'自宅の住所',accessToken:'secret-example',raw:{description:'個人の予定'}},...dishes.slice(1)],
  previous:[{dishes:[{name:'前の献立',category:'main',locked:false,location:'個人情報',token:'secret-other'}]}]};
 const prompt=createMenuRequest(enriched).prompt;
 assert.match(prompt,/前の献立/);
 for(const secret of ['自宅の住所','secret-example','個人の予定','個人情報','secret-other'])
  assert.doesNotMatch(prompt,new RegExp(secret));
});
