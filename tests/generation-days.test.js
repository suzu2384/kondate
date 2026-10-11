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
