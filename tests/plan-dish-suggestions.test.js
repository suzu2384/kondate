import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {recordDishSuggestions} from '../src/dish-suggestions.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const source=(a,b)=>{
 const start=app.indexOf(a),end=app.indexOf(b,start);
 assert.ok(start>=0&&end>start,'source region '+a+' must exist');
 return app.slice(start,end);
};
const masterItems=[
 {name:'鮭の塩焼き',category:'main',protein:'魚'},
 {name:'鯖の味噌煮',category:'main',protein:'魚'},
 {name:'ほうれん草のおひたし',category:'side'},
 {name:'サラダ',category:'side'}
];
const draft=[{dishes:[{name:'鶏肉と野菜の炒め物',category:'main'}]}];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

test('the menu swap/add dialog uses the same accessible listbox as the record editor',()=>{
 const calls=[];
 const context={
  state:{draft},editingPlan:null,planDishChoices:[],categoryOptions:()=>'<option value="main">主菜</option>',
  esc,button:(text,action)=>'<button data-action="'+action+'">'+text+'</button>',
  modal:(title,body,footer)=>calls.push({title,body,footer})
 };
 const edit=runInNewContext(source('function editPlanDish(','function checkDraft(')+';editPlanDish',context);
 edit(0,0);
 assert.equal(calls.length,1);
 assert.equal(calls[0].title,'料理を差し替える');
 assert.match(calls[0].body,/id="plan-name"/);
 assert.match(calls[0].body,/aria-autocomplete="list"/);
 assert.match(calls[0].body,/aria-controls="plan-dish-suggestions"/);
 assert.match(calls[0].body,/id="plan-dish-suggestions" class="dish-suggestions" role="listbox"/);
 assert.doesNotMatch(calls[0].body,/<datalist|list="plan-options"/);
 assert.match(calls[0].footer,/data-action="save-plan-dish"/);
 assert.match(calls[0].footer,/data-action="delete-plan-dish"/);
 edit(0,null);
 assert.equal(calls[1].title,'料理を追加');
 assert.doesNotMatch(calls[1].footer,/delete-plan-dish/);
});

test('typed plan names suggest selected-category dishes from plan then master',()=>{
 const category={value:'main'};
 const popup={innerHTML:'',hidden:true};
 const input={
  id:'plan-name',value:'',attributes:{},
  closest:()=>({querySelector:()=>popup}),
  setAttribute(k,v){this.attributes[k]=v;}
 };
 const ctx={
  editingPlan:{dayIndex:0,dishIndex:0},planDishChoices:[],
  $:selector=>selector==='#plan-category'?category:null,
  master:()=>masterItems,state:{draft},recordDishSuggestions,categoryName:c=>c==='main'?'主菜':'副菜',esc
 };
 const show=runInNewContext(source('function showPlanDishSuggestions(','function pickRecordDishSuggestion(')+';showPlanDishSuggestions',ctx);
 show(input);
 assert.equal(ctx.planDishChoices[0].name,'鶏肉と野菜の炒め物');
 assert.ok(ctx.planDishChoices.some(d=>d.name==='鮭の塩焼き'));
 assert.ok(ctx.planDishChoices.every(d=>d.category==='main'));
 assert.match(popup.innerHTML,/data-action="suggest-plan-dish"/);
 assert.equal(input.attributes['aria-expanded'],'true');
 assert.equal(popup.hidden,false);
 input.value='鮭';show(input);
 assert.deepEqual(ctx.planDishChoices.map(x=>x.name),['鮭の塩焼き']);
 category.value='side';input.value='サラダ';show(input);
 assert.deepEqual(ctx.planDishChoices.map(x=>x.name),['サラダ']);
 category.value='main';show(input);
 assert.equal(ctx.planDishChoices.length,0);
 assert.equal(popup.hidden,true);
 assert.equal(input.attributes['aria-expanded'],'false');
});

test('choosing a plan suggestion edits only the dialog, not the draft',()=>{
 const input={value:'',blurred:false,blur(){this.blurred=true;}};
 const category={value:'side'};
 const ctx={
  editingPlan:{dayIndex:0,dishIndex:0},
  planDishChoices:[{name:'鮭の塩焼き',category:'main'}],
  $:selector=>({'#plan-name':input,'#plan-category':category})[selector],
  hideDishSuggestions:()=>{ctx.planDishChoices=[];}
 };
 const pick=runInNewContext(source('function pickPlanDishSuggestion(','function openRecord(')+';pickPlanDishSuggestion',ctx);
 pick({dataset:{choice:'0'}});
 assert.equal(input.value,'鮭の塩焼き');
 assert.equal(category.value,'main');
 assert.equal(input.blurred,true);
 assert.equal(draft[0].dishes[0].name,'鶏肉と野菜の炒め物');
 assert.equal(ctx.planDishChoices.length,0);
});

test('plan suggestions work through mobile tap, pointer, focus, and keyboard handlers',()=>{
 assert.match(app,/'suggest-plan-dish':pickPlanDishSuggestion/);
 assert.match(app,/pickPlanDishSuggestion\(start\.candidate\)/);
 assert.match(app,/pickPlanDishSuggestion\(candidate\)/);
 assert.match(app,/closest\?\.\('\[data-action="suggest-record-dish"\],\[data-action="suggest-plan-dish"\]'\)/);
 assert.match(app,/if\(el\.id==='plan-name'\)showPlanDishSuggestions\(el\)/);
 assert.match(app,/if\(field\.id==='plan-name'\)showPlanDishSuggestions\(field\)/);
 assert.match(app,/if\(el\.id==='plan-category'\)/);
 assert.match(app,/querySelector\('\[data-editor-name\], #plan-name'\)/);
 assert.match(app,/if\(e\.key==='ArrowDown'\)/);
 assert.match(app,/if\(e\.key==='Escape'\)hideDishSuggestions\(\)/);
 assert.match(app,/function pickRecordDishSuggestion\(button\)/);
});
