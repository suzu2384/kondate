import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMenuRequest,parseMenuResponse} from '../src/ai-menu.js';
import {createFirebaseAIProvider} from '../src/ai-firebase.js';
import {AIService} from '../src/ai.js';
import {generationIssuesNotice,generationFailureNotice,normalizeStatusNotice} from '../src/status-notice.js';

const master=Array.from({length:6},(_,i)=>({
 name:'定番料理'+i,category:'main',count:1,lastDate:'2026-05-01'
}));
const context={
 master,
 rules:{days:7,counts:{main:1},newMain:true,unique:true,
  excludeRecent:false,recentDays:7,preferOld:true,balance:true},
 previous:[]
};
const good=JSON.stringify({days:Array.from({length:7},(_,i)=>({
 dishes:[i===6?{name:'鶏肉の新作煮込み',category:'main',new:true}:
  {name:'定番料理'+i,category:'main'}]
}))});
const short=JSON.stringify({days:JSON.parse(good).days.slice(0,6)});
const cfg={mode:'shared-firebase',firebase:{apiKey:'public',appId:'app',projectId:'project'},
 appCheckSiteKey:'public-site-key',model:'gemini-3.5-flash-lite'};
function provider(texts){
 const calls=[];
 const sdk={
  app:{initializeApp:()=>({})},
  appCheck:{initializeAppCheck:()=>({}),ReCaptchaEnterpriseProvider:class{},
   getToken:async()=>({token:'mock'})},
  ai:{GoogleAIBackend:class{},getAI:()=>({}),getGenerativeModel:()=>({
   generateContent:async prompt=>{
    calls.push(prompt);
    return {response:{text:()=>texts.shift()}};
   }
  })}
 };
 return {service:createFirebaseAIProvider(cfg,{loadSDK:async()=>sdk}),calls};
}

test('seven days is explicit and a short response exposes requested and returned counts',()=>{
 const {prompt}=createMenuRequest(context);
 assert.match(prompt,/必ず7日/);
 assert.match(prompt,/7個の要素/);
 assert.throws(()=>parseMenuResponse(short,context),/要求7日・返答6日/);
 assert.throws(()=>parseMenuResponse('{}',context),/days配列がありません/);
});
test('AI retries six-day response and reports a warning only after all seven days validate',async()=>{
 const {service,calls}=provider([short,good]);
 const result=await new AIService(service).generate(context);
 assert.equal(calls.length,2);
 assert.match(calls[1],/必ず7日分/);
 assert.equal(result.length,7);
 assert.match(result.warnings[0],/初回/);
 assert.equal(result[6].dishes[0].isNew,true);
 assert.equal(result[0].dishes[0].isNew,false);
});
test('two invalid AI responses still fail and never count as a valid partial result',async()=>{
 const {service,calls}=provider([short,short]);
 await assert.rejects(new AIService(service).generate(context),/要求7日・返答6日/);
 assert.equal(calls.length,2);
});
test('status severities distinguish failed requirements, recovered warnings and success',()=>{
 assert.equal(generationFailureNotice(Error('通信失敗'),'ai').severity,'error');
 assert.equal(generationIssuesNotice(['候補が1品不足しています']).severity,'error');
 assert.equal(generationIssuesNotice(['食材の偏りに注意'],{requirementsMet:true}).severity,'warning');
 assert.equal(normalizeStatusNotice('保存しました').severity,'info');
});
test('generating controls, outcome colors, and original main badges are represented in UI',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.match(app,/rules:structuredClone\(state.rules\)/);
 assert.match(app,/previous:structuredClone\(state.draft\)/);
 assert.match(app,/statusBar\?\.classList\.toggle\('status-error'/);
 assert.match(app,/statusBar\?\.classList\.toggle\('status-warning'/);
 assert.match(app,/class="dish-name \$\{d.isNew/);
 assert.match(app,/new-dish-badge/);
 assert.match(css,/#status-bar\.status-error\{background:#9e2424/);
 assert.match(css,/#status-bar\.status-warning\{background:#ffdc75/);
});

test('a previously suggested new main triggers a second AI call rather than being accepted',async()=>{
 const previousName='鶏肉の新作煮込み';
 const changedName='サバと根菜の甘酢焼き';
 const repeated={...context,recentNewMains:[previousName]};
 const {service,calls}=provider([good,good.replace(previousName,changedName)]);
 const plan=await new AIService(service).generate(repeated);
 assert.equal(calls.length,2);
 assert.equal(plan[6].dishes[0].name,changedName);
 assert.match(calls[0],/recentNewMains/);
 assert.match(calls[1],/前回までと同じ新しい主菜/);
 assert.match(plan.warnings[0],/初回/);
});

test('if the AI repeatedly proposes an old new main, keep the existing plan instead of accepting it',async()=>{
 const repeated={...context,recentNewMains:['鶏肉の新作煮込み']};
 const {service,calls}=provider([good,good]);
 await assert.rejects(new AIService(service).generate(repeated),/前回までと同じ新しい主菜/);
 assert.equal(calls.length,2);
});

test('the app persists only recent proposed names and increases model variety',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const firebase=readFileSync(new URL('../src/ai-firebase.js',import.meta.url),'utf8');
 assert.match(app,/recentNewMains:\[\]/);
 assert.match(app,/recentNewMains:\[\.\.\.state\.recentNewMains\]/);
 assert.match(app,/state\.recentNewMains=rememberNewMainSuggestions\(state\.recentNewMains,plan\)/);
 assert.match(firebase,/temperature:0\.95/);
});

test('seven-day response is rejected if it merely repeats a prior draft despite many fresh alternatives',async()=>{
 const large=Array.from({length:28},(_,i)=>({name:'料理'+i,category:'main',lastDate:'2025-01-01'}));
 const prior=Array.from({length:7},(_,i)=>({dishes:[{name:'料理'+i,category:'main'}]}));
 const repeat=JSON.stringify({days:Array.from({length:7},(_,i)=>({
  dishes:[i===6?{name:'今週の新作主菜',category:'main',new:true}:{name:'料理'+i,category:'main'}]
 }))});
 const modified={...context,master:large,rules:{...context.rules,preferOld:false},previous:prior};
 const {service,calls}=provider([repeat,repeat]);
 await assert.rejects(new AIService(service).generate(modified),/ほぼ同じ料理/);
 assert.equal(calls.length,2);
});
