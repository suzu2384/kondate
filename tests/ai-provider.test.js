import test from 'node:test';
import assert from 'node:assert/strict';
import {createAIProvider,AI_PROVIDER_MODES} from '../src/ai-provider.js';
import {createMenuRequest,parseMenuResponse} from '../src/ai-menu.js';
import {AIService} from '../src/ai.js';
import {readFileSync} from 'node:fs';

const base={
 master:[{name:'カレー',category:'main',count:1,lastDate:'2026-01-01',protein:'肉',method:'煮る',genre:'洋食'},
  {name:'肉じゃが',category:'main',count:0,protein:'肉',method:'煮る',genre:'和食'}],
 rules:{days:2,counts:{main:1},unique:true,excludeRecent:false,recentDays:7,newMain:true,preferOld:true,balance:true},
 previous:[{id:'p0',dishes:[{name:'カレー',category:'main',locked:true}]}]
};
const cfg={mode:'shared-firebase',firebase:{apiKey:'public-firebase-key',appId:'app',projectId:'project'},appCheckSiteKey:'public-site-key',model:'gemini-3.5-flash-lite'};

test('defaults fail closed and personal mode is an isolated provider boundary',()=>{
 assert.equal(createAIProvider({}),null);
 assert.equal(createAIProvider({...cfg,appCheckSiteKey:''}),null);
 assert.equal(createAIProvider({...cfg,model:'gemini-paid-model'}),null);
 assert.equal(createAIProvider({mode:AI_PROVIDER_MODES.PERSONAL}),null);
 const personal={generate:async()=>[]};
 assert.equal(createAIProvider({mode:AI_PROVIDER_MODES.PERSONAL},{personalProvider:personal}),personal);
});
test('only minimal meal names and metadata are sent, not Calendar raw events, location or auth',()=>{
 const request=createMenuRequest({...base,master:[{...base.master[0],location:'自宅',raw:{description:'個人の予定'},accessToken:'token'},base.master[1]]});
 assert.match(request.prompt,/カレー|肉じゃが/);
 assert.doesNotMatch(request.prompt,/自宅|個人の予定|accessToken|token|location|raw/);
 assert.match(request.prompt,/locked/);
 assert.doesNotThrow(()=>createMenuRequest({...base,rules:{...base.rules,days:15}}));
 assert.throws(()=>createMenuRequest({...base,rules:{...base.rules,days:16}}),/15日/);
});
test('AI output is normalized against known candidates and preserved day ids',async()=>{
 const text=JSON.stringify({days:[{dishes:[{name:'カレー',category:'main'}]},{dishes:[{name:'肉じゃが',category:'main'}]}]});
 const plan=parseMenuResponse(text,base);
 assert.deepEqual(plan.map(d=>d.id),['p0','day-1']);
 assert.equal(plan[0].dishes[0].protein,'肉');
 const ai=new AIService({generate:async()=>plan});
 const validated=await ai.generate(base);
 assert.equal(validated[0].dishes[0].locked,true);
 assert.throws(()=>parseMenuResponse(text.replace('肉じゃが','謎の料理'),base),/登録候補にない/);
});
test('a mock Firebase implementation uses App Check and Google AI backend, only once',async()=>{
 const calls=[],sdk={
  app:{initializeApp:(config,name)=>{calls.push('init:'+name);return {};}},
  appCheck:{initializeAppCheck:()=>{calls.push('check');return {};},ReCaptchaEnterpriseProvider:class{constructor(key){calls.push('captcha:'+key)}},getToken:async()=>{calls.push('token');return {token:'test'};}},
  ai:{getAI:()=>{calls.push('ai');return {};},GoogleAIBackend:class{},getGenerativeModel:()=>({generateContent:async()=>{calls.push('generate');return {response:{text:()=>JSON.stringify({days:[{dishes:[{name:'カレー',category:'main'}]},{dishes:[{name:'肉じゃが',category:'main'}]}]})}};}})}
 };
 const service=createAIProvider(cfg,{loadSDK:async()=>sdk});
 const plan=await service.generate(base);
 assert.equal(plan.length,2);
 assert.deepEqual(calls,['init:kondate-ai-shared','captcha:public-site-key','check','token','ai','generate']);
 for(let i=0;i<4;i++)await service.generate(base);
 assert.equal(calls.filter(x=>x==='check').length,1);
 assert.equal(calls.filter(x=>x==='generate').length,5);
});
test('shared AI has no per-device usage limit or local counter',()=>{
 const provider=readFileSync(new URL('../src/ai-firebase.js',import.meta.url),'utf8');
 const defaults=readFileSync(new URL('../src/ai-config.js',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 for(const source of [provider,defaults,build])assert.doesNotMatch(source,/maxPerDevicePerDay|checkDeviceLimit|kondate\.ai-shared-usage/);
 assert.doesNotMatch(app,/AIを選ぶと、料理候補|この端末で1日3回/);
});
test('unconfigured public build contains no shared Firebase credentials',()=>{
 const cfgText=readFileSync(new URL('../src/ai-config.js',import.meta.url),'utf8');
 assert.match(cfgText,/mode:'disabled'/);
});

test('shared generation stays disabled until explicitly configured and the free model is pinned',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const build=readFileSync(new URL('../scripts/build.js',import.meta.url),'utf8');
 assert.equal(pkg.version,'1.4.2');
 assert.match(build,/KONDATE_AI_SPARK_VERIFIED/);
 assert.match(build,/mode:'disabled'/);
 assert.match(build,/model:'gemini-3.5-flash-lite'/);
 assert.match(build,/dist\/src\/ai-config.js/);
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/new AIService\(createAIProvider\(AI_PUBLIC_CONFIG\)\)/);
 assert.match(app,/menuGenerationMode/);
 assert.match(app,/aiGenerating=true/);
});
