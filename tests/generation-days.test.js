import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_GENERATION_DAYS,normalizeGenerationDays,defaultRules} from '../src/model.js';
import {AI_MAX_DAYS,createMenuRequest} from '../src/ai-menu.js';
import {generate} from '../src/generator.js';

test('both generators use the same 15-day maximum and retain a 7-day default',()=>{
 assert.equal(MAX_GENERATION_DAYS,15);
 assert.equal(AI_MAX_DAYS,MAX_GENERATION_DAYS);
 assert.equal(defaultRules.days,7);
 assert.equal(normalizeGenerationDays(undefined),7);
 assert.equal(normalizeGenerationDays(7),7);
 assert.equal(normalizeGenerationDays(15),15);
 assert.equal(normalizeGenerationDays(31),15);
 assert.equal(normalizeGenerationDays(0),7);
 const master=Array.from({length:15},(_,i)=>({name:`料理${i+1}`,category:'main',count:0}));
 const rules={...defaultRules,days:15,excludeRecent:false};
 assert.equal(generate(master,rules).plan.length,15);
 assert.doesNotThrow(()=>createMenuRequest({master,rules}));
 assert.throws(()=>createMenuRequest({master,rules:{...rules,days:16}}),/15日/);
});

test('generation controls use a 1-15 select shared by both generation modes',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/<select aria-label="生成日数" id="days">/);
 assert.match(app,/Array\.from\(\{length:MAX_GENERATION_DAYS\}/);
 assert.doesNotMatch(app,/type="number" id="days"/);
 assert.match(app,/state\.rules\.days=normalizeGenerationDays\(state\.rules\.days\)/);
 assert.match(app,/requested>MAX_GENERATION_DAYS/);
 assert.match(app,/el\.id==='days'\)\{state\.rules\.days=normalizeGenerationDays\(el\.value\)/);
});

test('AI / rules selection is persisted and the phone layout keeps all controls readable',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const drive=readFileSync(new URL('../src/drive-backup.js',import.meta.url),'utf8');
 assert.match(app,/menuGenerationMode:'rules'/);
 assert.match(app,/state\.menuGenerationMode=state\.menuGenerationMode==='ai'\?'ai':'rules'/);
 assert.match(app,/if\(el\.id==='generate-mode'\)\{state\.menuGenerationMode=[^\n]+persist\(\);return;/);
 assert.doesNotMatch(app,/let aiGenerating=false,menuGenerationMode=/);
 assert.match(drive,/,'menuGenerationMode','theme'/);
 assert.match(css,/\.generation-screen \.generation-controls #generate-mode\{[\s\S]*?min-width:150px;max-width:none/);
 assert.match(css,/@media\(max-width:520px\)\{[\s\S]*?display:flex;flex-wrap:nowrap;align-items:center/);
 const phoneControls=css.match(/@media\(max-width:520px\)\{[\s\S]*?\.generation-screen \.generation-controls\{([^}]*)\}/)?.[1]||'';
 assert.doesNotMatch(phoneControls,/display:grid|grid-template-columns|flex-wrap:wrap/);
 assert.match(css,/\.generation-screen \.generation-controls #generate-mode\{\s*flex:0 0 132px;width:132px;min-width:132px;max-width:132px/);
 assert.match(css,/\.generation-screen \.generation-submit-button\{[\s\S]*?margin-left:auto/);
 assert.match(css,/\.generation-screen \.generation-rule-button\{[\s\S]*?font-size:12px/);
 assert.match(css,/\.generation-screen \.generation-submit-button:disabled\{opacity:\.45;filter:none\}/);
});

test('generator controls are ordered for a single mobile row',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const fragment=app.slice(app.indexOf('function generateScreen(){'),app.indexOf('function photoScreen(){'));
 const parts=['id="days"','id="generate-mode"',"button('ルール調整'","button('生成'"];
 let last=-1;
 for(const item of parts){const index=fragment.indexOf(item);assert.ok(index>last,item+' must follow the previous control');last=index;}
});
