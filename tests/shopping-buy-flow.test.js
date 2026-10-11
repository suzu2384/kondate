import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {normalize,resolveName,validateDishes} from '../src/model.js';
import {validateIngredients,INGREDIENT_UNITS,MAX_INGREDIENTS} from '../src/ingredients.js';
import {addShoppingDish} from '../src/shopping.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const begin=app.indexOf('let editingMaster=null,editingPlan=null,pendingMasterBuy=false;');
const end=app.indexOf('async function generateMasterIngredients()',begin);
const buyBegin=app.indexOf('function buyMasterDish('),buyEnd=app.indexOf('function shoppingData()',buyBegin);
assert.ok(begin>=0&&end>begin&&buyBegin>=0&&buyEnd>buyBegin);

function harness(initial=[]){
 const state={shopping:{selected:[]}},data={metadata:{},aliases:{},manual:[]};
 let rows=[],lastModal=null,rendered=0,persisted=0,tab='master';
 const saved={name:'肉じゃが',category:'main',key:'肉じゃが',dates:[],count:0,protein:'不明',method:'不明',genre:'不明'};
 const fields={'#master-name':{value:'肉じゃが'},'#master-category':{value:'main'},'#master-protein':{value:'肉'},'#master-method':{value:'煮る'},'#master-genre':{value:'和食'}};
 const ctx={
  state,data:()=>data,master:()=>[{...saved,ingredients:[],...data.metadata['肉じゃが']},...data.manual.map(d=>({...d,key:normalize(d.name),dates:[],count:0,ingredients:data.metadata[normalize(d.name)]?.ingredients||[]}))],
  normalize,resolveName,validateDishes,validateIngredients,INGREDIENT_UNITS,MAX_INGREDIENTS,addShoppingDish,
  ai:{available:false},categoryOptions:()=>'<option value="main">主菜</option>',
  esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  button:(label,action)=>'<button data-action="'+action+'">'+label+'</button>',
  modal:(title,body,footer)=>{lastModal={title,body,footer};},
  $:selector=>fields[selector]||null,
  document:{querySelectorAll:selector=>selector.startsWith('#master-ingredients')?rows.map(x=>({querySelector:sel=>({
    '[data-ingredient-name]':{value:x.name},'[data-ingredient-quantity]':{value:String(x.quantity)},
    '[data-ingredient-unit]':{value:x.unit}
  })[sel]})):[]},
  persist:()=>{persisted++;},render:()=>{rendered++;},closeModal:()=>{},notify:()=>{},
  isShoppingMasterSelected:d=>state.shopping.selected.some(s=>normalize(s)===normalize(d.name)),
  tab
 };
 const view=runInNewContext(app.slice(begin,end)+app.slice(buyBegin,buyEnd)+';({buyMasterDish,editMaster,saveMaster})',ctx);
 return {view,state,data,fields,setRows:v=>{rows=v;},getModal:()=>lastModal,getPersisted:()=>persisted};
}

test('Buy on a material-less dish opens editor; saving empty data does not add to shopping',()=>{
 const h=harness();
 h.view.buyMasterDish({dataset:{name:'肉じゃが',key:'肉じゃが',category:'main'}});
 assert.match(h.getModal().title,/材料を登録して買い物に追加/);
 assert.match(h.getModal().body,/材料（1人前）/);
 assert.equal(h.state.shopping.selected.length,0);
 h.view.saveMaster();
 assert.equal(h.state.shopping.selected.length,0);
 assert.deepEqual(h.data.metadata['肉じゃが'].ingredients,[]);
 assert.equal(h.getPersisted(),1);
});

test('After Buy, confirming a nonempty ingredient editor saves recipe and selects it once',()=>{
 const h=harness();
 h.view.buyMasterDish({dataset:{name:'肉じゃが',key:'肉じゃが',category:'main'}});
 h.setRows([{name:'醤油',quantity:'1',unit:'大さじ'}]);
 h.view.saveMaster();
 assert.deepEqual(Array.from(h.state.shopping.selected),['肉じゃが']);
 assert.equal(h.data.metadata['肉じゃが'].ingredients[0].baseQuantity,15);
 h.view.buyMasterDish({dataset:{name:'肉じゃが',key:'肉じゃが',category:'main'}});
 assert.deepEqual(Array.from(h.state.shopping.selected),['肉じゃが']);
});

test('Buy a generated dish not yet in master: editor uses dish name and registers ingredients',()=>{
 const h=harness();
 h.view.buyMasterDish({dataset:{name:'創作料理',key:'',category:'main'}});
 assert.match(h.getModal().body,/value="創作料理"/);
 h.fields['#master-name'].value='創作料理';
 h.setRows([{name:'牛乳',quantity:100,unit:'ml'}]);
 h.view.saveMaster();
 assert.deepEqual(Array.from(h.state.shopping.selected),['創作料理']);
 assert.equal(h.data.manual.find(d=>d.name==='創作料理').name,'創作料理');
 assert.equal(h.data.metadata['創作料理'].ingredients[0].baseQuantity,100);
});
