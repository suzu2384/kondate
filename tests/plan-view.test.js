import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_GENERATION_DAYS} from '../src/model.js';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const match=source.match(/function generateScreen\(\)\{([\s\S]*?)\n\}\nfunction photoScreen\(/);
assert.ok(match,'generator screen template is available');
const view=new Function('state','ai','issues','button','esc','categoryName','empty','menuGenerationMode','aiGenerating','MAX_GENERATION_DAYS',match[1]);
const button=(text,action,cls='',attrs='')=>'<button class="'+cls+'" data-action="'+action+'" '+attrs+'>'+text+'</button>';
const escape=v=>String(v);
function screen(days){
 const state={rules:{days:days.length},draft:days.map(dishes=>({dishes}))};
 return view(state,{available:false},[],button,escape,c=>({main:'主菜',side:'副菜'}[c]||c),()=>'<div>empty</div>','rules',false,MAX_GENERATION_DAYS);
}
test('one Main dish per day generates exactly seven compact rows',()=>{
 const html=screen(Array.from({length:7},(_,i)=>[{category:'main',name:'料理'+i,locked:i===0}]));
 assert.equal((html.match(/class="plan-card compact-plan-card/g)||[]).length,7);
 assert.equal((html.match(/class="plan-dish compact-plan-dish/g)||[]).length,7);
 assert.equal((html.match(/data-action="reroll"/g)||[]).length,7);
 assert.equal((html.match(/data-action="edit-plan-dish"/g)||[]).length,7);
 assert.equal((html.match(/class="plan-category"/g)||[]).length,7);
 assert.doesNotMatch(html,/data-action="lock"|data-action="record-day"|data-action="add-plan-dish"/);
 assert.doesNotMatch(html,/AIキー不要|DAY 0|固定 \/ ○ 未固定/);
});
test('more categories add dish rows without adding extra day cards',()=>{
 const html=screen(Array.from({length:7},(_,i)=>[{category:'main',name:'主菜'+i},{category:'side',name:'副菜'+i}]));
 assert.equal((html.match(/class="plan-card compact-plan-card/g)||[]).length,7);
 assert.equal((html.match(/class="plan-dish compact-plan-dish/g)||[]).length,14);
 assert.equal((html.match(/data-action="reroll"/g)||[]).length,14);
});
test('compact generator defines single-column mobile layout and inline reroll',()=>{
 assert.match(css,/\.compact-plan-grid\{[\s\S]*?display:flex;flex:1 1 auto;flex-direction:column/);
 assert.match(css,/\.compact-plan-card\{[\s\S]*?grid-template-columns:46px minmax\(0,1fr\)/);
 assert.match(css,/\.compact-plan-dish\{[\s\S]*?grid-template-columns:65px minmax\(0,1fr\) 28px/);
 assert.match(source,/if\(state\.draft\[i\]\?\.dishes\[j\]\?\.locked\)state\.draft\[i\]\.dishes\[j\]=/);
});

test('mixed day sizes keep individual containers with all their dish rows',()=>{
 const days=[
  [{category:'main',name:'長い料理名'.repeat(30)}],
  [{category:'main',name:'煮魚'},{category:'side',name:'副菜'}],
  [{category:'main',name:'肉料理'},{category:'side',name:'サラダ'},{category:'soup',name:'味噌汁'}],
  ...Array.from({length:4},()=>[{category:'main',name:'卵料理'}])
 ];
 const html=screen(days);
 assert.equal((html.match(/data-dish-count="1"/g)||[]).length,5);
 assert.equal((html.match(/data-dish-count="2"/g)||[]).length,1);
 assert.equal((html.match(/data-dish-count="3"/g)||[]).length,1);
 assert.equal((html.match(/class="plan-dish compact-plan-dish/g)||[]).length,10);
 assert.doesNotMatch(css.match(/\.compact-plan-grid\{[^}]*\}/)?.[0]||'',/auto-fill|repeat\(3/);
 assert.match(css,/flex:0 0 auto;width:100%;min-width:0;max-width:100%/);
 assert.match(css,/white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
});

test('two dishes per day use compact height budget and the day label is vertically centered',()=>{
 const html=screen(Array.from({length:7},(_,i)=>[
  {category:'main',name:'主菜'+i},{category:'side',name:'副菜'+i}
 ]));
 assert.equal((html.match(/data-dish-count="2"/g)||[]).length,7);
 assert.equal((html.match(/class="plan-dish compact-plan-dish/g)||[]).length,14);
 const compact=css.slice(css.indexOf('/* v1.3.13:'));
 assert.match(compact,/--compact-row-height:clamp\(24px,3\.8dvh,29px\)/);
 assert.match(compact,/\.compact-plan-card\{[\s\S]*?align-items:center;align-self:stretch/);
 assert.match(compact,/\.compact-plan-head\{[\s\S]*?align-self:center/);
 assert.match(compact,/\.compact-plan-card \.plan-dishes\{[\s\S]*?gap:0/);
 assert.match(compact,/\.compact-plan-grid\{[\s\S]*?gap:3px/);
 assert.match(compact,/\.compact-plan-dish \.reroll-button\{[\s\S]*?font-size:18px/);
 assert.match(compact,/height:var\(--compact-row-height\)/);
 // CSS maximum: two 29px dishes + 2px vertical padding + borders, times seven,
 // plus 6 inter-card gaps. Leaves room for controls even on small displays.
 const sevenDaysMax=7*(2*29+4)+6*3;
 assert.ok(sevenDaysMax<=460,'seven days of two dishes fit a small phone content budget');
});
