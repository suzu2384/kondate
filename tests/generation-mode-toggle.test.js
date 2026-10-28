import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),sw=read('sw.js');
const start=app.indexOf('function generationModeButtons(){');
const end=app.indexOf('function generateScreen(){',start);
assert.ok(start>=0&&end>start);
const source=app.slice(start,end);
const button=(content,action,cls='',attrs='')=>'<button class="'+cls+'" data-action="'+action+'" '+attrs+'>'+content+'</button>';
function controls(mode='rules',available=true,generating=false){
 const state={menuGenerationMode:mode};
 const fn=runInNewContext(source+';generationModeButtons',{state,ai:{available},aiGenerating:generating,button});
 return fn();
}

test('generation mode uses the uploaded CPU SVG and existing bot SVG in a two-option icon toggle',()=>{
 const html=controls();
 assert.match(html,/role="group" aria-label="献立の生成方法"/);
 assert.equal((html.match(/data-action="generation-mode"/g)||[]).length,2);
 assert.ok(html.indexOf('generation-mode-icon-cpu')<html.indexOf('generation-mode-icon-bot'));
 assert.match(html,/data-mode="rules" aria-label="ルールベース"[^>]*aria-pressed="true"/);
 assert.match(html,/data-mode="ai" aria-label="AI"[^>]*aria-pressed="false"/);
 assert.match(css,/\.generation-mode-icon-cpu\{[\s\S]*?icons\/actions\/cpu\.svg/);
 assert.match(css,/\.generation-mode-icon-bot\{[\s\S]*?icons\/tabs\/bot\.svg/);
 assert.ok(read('icons/actions/cpu.svg').includes('lucide-cpu'));
 assert.ok(read('icons/tabs/bot.svg').includes('lucide-bot'));
 assert.ok(sw.includes("'./icons/actions/cpu.svg'"));
 assert.ok(sw.includes("'./icons/tabs/bot.svg'"));
});

test('selected AI is visibly active and unavailable AI / generating states block mode changes',()=>{
 assert.match(controls('ai',true),/data-mode="ai" aria-label="AI"[^>]*aria-pressed="true"/);
 assert.match(controls('rules',false),/data-mode="ai" aria-label="AI（未設定）"[^>]*disabled/);
 assert.equal((controls('rules',true,true).match(/disabled/g)||[]).length,2);
});

test('changing generation modes persists preference, rejects disabled AI and keeps a single choice',()=>{
 const found=app.match(/'generation-mode':b=>\{([\s\S]*?)\n \},\n 'shopping-mode'/);
 assert.ok(found);
 const ctx={state:{menuGenerationMode:'rules'},ai:{available:true},aiGenerating:false,
  saved:0,renders:0,persist(){this.saved++},render(){this.renders++}};
 // Normal functions in the context do not rely on their receiver.
 ctx.persist=()=>ctx.saved++;
 ctx.render=()=>ctx.renders++;
 const action=runInNewContext('(b)=>{'+found[1]+'}',ctx);
 action({dataset:{mode:'ai'}});
 assert.equal(ctx.state.menuGenerationMode,'ai');
 assert.equal(ctx.saved,1);
 assert.equal(ctx.renders,1);
 action({dataset:{mode:'ai'}});
 assert.equal(ctx.saved,1);
 ctx.ai.available=false;
 action({dataset:{mode:'rules'}});
 action({dataset:{mode:'ai'}});
 assert.equal(ctx.state.menuGenerationMode,'rules');
 assert.equal(ctx.saved,2);
 ctx.aiGenerating=true;
 action({dataset:{mode:'ai'}});
 assert.equal(ctx.state.menuGenerationMode,'rules');
 assert.equal(ctx.saved,2);
});

test('generation action reads persisted mode directly; no obsolete native select remains',()=>{
 const screen=app.slice(app.indexOf('function generateScreen(){'),app.indexOf('function buyMasterDish(){'));
 assert.match(screen,/generationModeButtons\(\)/);
 assert.doesNotMatch(screen,/id="generate-mode"/);
 assert.match(app,/const aiMode=state\.menuGenerationMode==='ai'/);
 assert.match(css,/\.generation-screen \.generation-controls \.generation-mode-toggle\{[\s\S]*?flex:0 0 auto/);
});
