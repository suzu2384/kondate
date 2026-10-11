import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generationIssuesNotice,generationFailureNotice,normalizeStatusNotice} from '../src/status-notice.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const handlerMatch=app.match(/\n generate:async\(\)=>\{([\s\S]*?)\n \},\n reroll:/);
assert.ok(handlerMatch,'real generation handler is extractable');
const runStart=app.indexOf('async function run(action,b){');
const runEnd=app.indexOf('\n\nconst PRESET_DRAG_HOLD_MS',runStart);
assert.ok(runStart>=0&&runEnd>runStart,'action dispatcher is extractable');
const runSource=app.slice(runStart,runEnd);

function harness(mode,generated){
 const messages=[],state={
  menuGenerationMode:mode,
  rules:{days:7,counts:{main:1}},
  draft:[],
 };
 const select={value:mode},days={value:'7'};
 const deps={
  state,
  ai:{
   available:true,
   generate:async()=>{if(generated instanceof Error)throw generated;return generated.plan;}
  },
  $:selector=>selector==='#days'?days:selector==='#generate-mode'?select:null,
  master:()=>[],
  MAX_GENERATION_DAYS:15,
  data:()=>({aliases:{}}),
  resolveName:name=>name,
  render:()=>{},
  persist:()=>{},
  generate:()=>generated,
  notify:message=>messages.push(normalizeStatusNotice(message)),
  generationIssuesNotice,
 };
 const maker=new Function('deps',
  'const {state,ai,$,master,MAX_GENERATION_DAYS,data,resolveName,render,persist,generate,notify,generationIssuesNotice}=deps;'+
  'let aiGenerating=false,issues=[];return async function(){'+handlerMatch[1]+'};');
 const action=maker(deps);
 const dispatcher=new Function('actions','notify','generationFailureNotice','state','updateConnection','$',
  'const busy=false;'+runSource+';return run;')(
   {generate:action},deps.notify,generationFailureNotice,state,()=>{},()=>({open:false})
  );
 return {invoke:()=>dispatcher('generate',{}),messages,state};
}

test('real rules handler reports a partial-generation problem to the status bar',async()=>{
 const result={plan:[{id:'day-0',dishes:[]}],
  issues:['1日目：mainの候補が1品不足しています。']};
 const app=harness('rules',result);
 await app.invoke();
 assert.equal(app.messages.length,1);
 assert.match(app.messages[0].summary,/候補が不足/);
 assert.match(app.messages[0].detail,/mainの候補が1品不足/);
 assert.deepEqual(app.messages[0].actions,['rules','master']);
 assert.deepEqual(app.state.draft,result.plan);
});

test('real rules handler preserves success messaging when generation succeeds',async()=>{
 const app=harness('rules',{plan:[],issues:[]});
 await app.invoke();
 assert.equal(app.messages.length,1);
 assert.equal(app.messages[0].summary,'献立案を作りました。カレンダーにはまだ登録していません。');
});

test('real AI generator failure is reported through the same structured status flow',async()=>{
 const app=harness('ai',new Error('AIの返答がJSON形式ではありません。'));
 await app.invoke();
 assert.equal(app.messages.length,1);
 assert.match(app.messages[0].summary,/AIの応答/);
 assert.match(app.messages[0].detail,/JSON形式/);
 assert.deepEqual(app.messages[0].actions,['use-rules']);
});
