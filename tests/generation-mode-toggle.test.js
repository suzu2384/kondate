import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),sw=read('sw.js');
const start=app.indexOf('function generationModeButtons(){'),end=app.indexOf('function generateScreen(){',start);
assert.ok(start>=0&&end>start);
const helper=app.slice(start,end);
const button=(label,action,cls='',attrs='')=>
 '<button class="'+cls+'" data-action="'+action+'" '+attrs+'>'+label+'</button>';
function markup(mode='rules',available=true,generating=false){
 return runInNewContext(helper+';generationModeButtons()',{
  state:{menuGenerationMode:mode},ai:{available},aiGenerating:generating,button
 });
}

test('two icon-only actions use the uploaded CPU and existing bot SVG',()=>{
 const html=markup();
 assert.equal((html.match(/data-action="generation-mode"/g)||[]).length,2);
 assert.match(html,/role="group" aria-label="献立の生成方法"/);
 assert.match(html,/data-mode="rules" aria-label="ルールベースで生成"/);
 assert.match(html,/data-mode="ai" aria-label="AIで生成"/);
 assert.match(html,/generation-mode-icon-cpu/);
 assert.match(html,/generation-mode-icon-bot/);
 assert.ok(read('icons/actions/cpu.svg').includes('lucide-cpu'));
 assert.match(css,/generation-mode-icon-cpu\{[^}]*icons\/actions\/cpu\.svg/);
 assert.match(css,/generation-mode-icon-bot\{[^}]*icons\/tabs\/bot\.svg/);
 assert.ok(sw.includes("'./icons/actions/cpu.svg'"));
 assert.ok(sw.includes("'./icons/tabs/bot.svg'"));
});

test('mode visual selection, unavailable AI and busy state are all reflected',()=>{
 const rules=markup('rules');
 assert.match(rules,/generation-mode-button selected" data-mode="rules"[^>]*aria-pressed="true"/);
 assert.match(rules,/generation-mode-button" data-mode="ai"[^>]*aria-pressed="false"/);
 const ai=markup('ai');
 assert.match(ai,/generation-mode-button selected" data-mode="ai"[^>]*aria-pressed="true"/);
 assert.equal((ai.match(/aria-pressed="true"/g)||[]).length,1);
 assert.match(markup('rules',false),/title="AI（未設定）"[^>]*disabled/);
 assert.doesNotMatch(markup('rules',false),/data-mode="rules"[^>]*disabled/);
 assert.equal((markup('ai',true,true).match(/ disabled/g)||[]).length,2);
});

test('mode action persists selection, ignores invalid or unavailable AI, and never regenerates',()=>{
 const body=app.match(/'generation-mode':b=>\{([\s\S]*?)\n \},/);
 assert.ok(body);
 const state={menuGenerationMode:'rules'},calls={persist:0,render:0};
 const ctx={state,ai:{available:true},aiGenerating:false,
  persist:()=>calls.persist++,render:()=>calls.render++};
 const action=runInNewContext('(b)=>{'+body[1]+'}',ctx);
 action({dataset:{mode:'ai'}});
 assert.equal(state.menuGenerationMode,'ai');
 assert.deepEqual(calls,{persist:1,render:1});
 action({dataset:{mode:'ai'}});
 assert.deepEqual(calls,{persist:1,render:1});
 action({dataset:{mode:'unknown'}});
 assert.deepEqual(calls,{persist:1,render:1});
 ctx.ai.available=false;
 action({dataset:{mode:'rules'}});
 action({dataset:{mode:'ai'}});
 assert.equal(state.menuGenerationMode,'rules');
 assert.deepEqual(calls,{persist:2,render:2});
 ctx.aiGenerating=true;
 action({dataset:{mode:'ai'}});
 assert.equal(state.menuGenerationMode,'rules');
 assert.deepEqual(calls,{persist:2,render:2});
});

test('generation remains controlled by saved mode with days, rules, generate and sharing unchanged',()=>{
 assert.match(app,/const aiMode=state\.menuGenerationMode==='ai'/);
 const view=app.slice(app.indexOf('function generateScreen(){'),app.indexOf('function buyMasterDish(',app.indexOf('function generateScreen(){')));
 assert.match(view,/generationModeButtons\(\)/);
 assert.doesNotMatch(view,/id="generate-mode"/);
 for(const text of ['id="days"',"button('ルール設定'","button('生成'",'data-kind="plan"']){
  assert.ok(view.includes(text),text);
 }
});
