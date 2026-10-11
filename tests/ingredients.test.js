import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {INGREDIENT_UNITS,normalizeIngredient,parseIngredientQuantity,validateIngredients,ingredientTotal} from '../src/ingredients.js';
import {createIngredientRequest,parseIngredientResponse} from '../src/ai-ingredients.js';
import {AIService} from '../src/ai.js';
import {createFirebaseAIProvider} from '../src/ai-firebase.js';
import {createDriveSnapshot,readDriveSnapshot,restoreDriveSnapshot} from '../src/drive-backup.js';
import {storedState} from '../src/storage.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('unit conversions are exact within their family and preserve user-entered units',()=>{
 const a=validateIngredients([
  {name:'醤油',quantity:1,unit:'大さじ'},
  {name:'みりん',quantity:'1/2',unit:'小さじ'},
  {name:'水',quantity:1,unit:'カップ'},
  {name:'砂糖',quantity:0.25,unit:'kg'},
  {name:'玉ねぎ',quantity:'1/4',unit:'個'},
  {name:'塩',quantity:null,unit:'少々'}
 ]);
 assert.deepEqual(a[0],{name:'醤油',quantity:1,unit:'大さじ',baseQuantity:15,baseUnit:'ml'});
 assert.equal(a[1].baseQuantity,2.5);
 assert.equal(a[2].baseQuantity,200);
 assert.equal(a[3].baseQuantity,250);
 assert.equal(a[4].baseQuantity,0.25);
 assert.equal(a[5].baseQuantity,null);
 assert.equal(a[5].baseUnit,'少々');
 assert.equal(normalizeIngredient({name:'牛乳',quantity:1.25,unit:'L'}).baseQuantity,1250);
 assert.equal(parseIngredientQuantity('1 1/2'),1.5);
 assert.ok(INGREDIENT_UNITS.includes('袋'));
});
test('aggregation converts only like units; never guess ingredient density',()=>{
 const totals=ingredientTotal([
  {name:'醤油',quantity:1,unit:'大さじ'},
  {name:'醤油',quantity:2,unit:'小さじ'},
  {name:'醤油',quantity:3,unit:'g'},
  {name:'鶏肉',quantity:0.2,unit:'kg'},
  {name:'鶏肉',quantity:40,unit:'g'}
 ]);
 assert.deepEqual(totals.map(x=>[x.name,x.baseQuantity,x.baseUnit]),[
  ['醤油',25,'ml'],['醤油',3,'g'],['鶏肉',240,'g']
 ]);
});
test('invalid and ambiguous ingredient inputs are rejected',()=>{
 for(const item of [
  {name:'',quantity:1,unit:'g'},
  {name:'塩',quantity:'大さじ',unit:'大さじ'},
  {name:'塩',quantity:0,unit:'g'},
  {name:'塩',quantity:-1,unit:'g'},
  {name:'塩',quantity:1,unit:'適量'},
  {name:'塩',quantity:1,unit:'unknown'}
 ])assert.throws(()=>normalizeIngredient(item));
 assert.throws(()=>validateIngredients([{name:'塩',quantity:1,unit:'g'},{name:'塩',quantity:2,unit:'kg'}]),/重複/);
 assert.throws(()=>validateIngredients(Array.from({length:61},()=>({name:'水',quantity:1,unit:'ml'}))),/最大60/);
 assert.ok(Number.isNaN(parseIngredientQuantity('1/0')));
});
test('AI prompt only transmits dish name; AI response uses validated structured data',async()=>{
 const prompt=createIngredientRequest('肉じゃが').prompt;
 assert.match(prompt,/1人前/);
 assert.match(prompt,/材料名・分量・単位/);
 assert.match(prompt,/肉じゃが/);
 assert.doesNotMatch(prompt,/accessToken|Calendar|clientId|location|履歴/);
 const sample=JSON.stringify({ingredients:[{name:'牛肉',quantity:50,unit:'g'},{name:'玉ねぎ',quantity:0.25,unit:'個'},{name:'醤油',quantity:1,unit:'小さじ'}]});
 assert.equal(parseIngredientResponse(sample)[2].baseQuantity,5);
 assert.throws(()=>parseIngredientResponse('not json'),/JSON/);
 assert.throws(()=>parseIngredientResponse(JSON.stringify({ingredients:[]})),/一覧/);
 assert.throws(()=>parseIngredientResponse(JSON.stringify({ingredients:[{name:'醤油',quantity:-2,unit:'g'}]})),/数量/);
 const ai=new AIService({generateIngredients:async()=>JSON.parse(sample).ingredients});
 assert.equal((await ai.generateIngredients('肉じゃが'))[0].baseQuantity,50);
 await assert.rejects(new AIService(null).generateIngredients('肉じゃが'),/利用できません/);
});
test('Firebase AI uses existing App Check and retries invalid ingredient JSON once',async()=>{
 const calls=[],sdk={
  app:{initializeApp:()=>{calls.push('initializeApp');return {};}},
  appCheck:{initializeAppCheck:()=>{calls.push('initializeAppCheck');return {};},ReCaptchaEnterpriseProvider:class{},getToken:async()=>{calls.push('check');return {token:'ok'};}},
  ai:{getAI:()=>({}),GoogleAIBackend:class{},getGenerativeModel:()=>{
   let n=0;
   return {generateContent:async prompt=>{
    calls.push('AI '+String(prompt).includes('1人前'));
    return {response:{text:()=>++n===1?'invalid':JSON.stringify({ingredients:[{name:'玉ねぎ',quantity:0.5,unit:'個'}]})}};
   }};
  }}
 };
 const provider=createFirebaseAIProvider({firebase:{},appCheckSiteKey:'site',model:'mock'},{loadSDK:async()=>sdk});
 const ingredients=await provider.generateIngredients('肉じゃが');
 assert.equal(ingredients[0].quantity,0.5);
 assert.equal(calls.filter(x=>x==='check').length,1);
 assert.equal(calls.filter(x=>x==='AI true').length,2);
});
test('ingredients round-trip through per-dish metadata, local persistence and Drive backup',()=>{
 const item=normalizeIngredient({name:'醤油',quantity:1,unit:'大さじ'});
 const state={scopes:{'client|calendar':{aliases:{},manual:[],metadata:{'肉じゃが':{category:'main',ingredients:[item]}},
  events:[{id:'history-private'}],legacy:{},lastSync:1}},
  categories:[{id:'main',name:'主菜'}],draft:[],rules:{days:7},timeZone:'Asia/Tokyo',from:'2000-01-01'};
 const serialized=storedState(state);
 assert.deepEqual(serialized.scopes['client|calendar'].metadata['肉じゃが'].ingredients,[item]);
 assert.deepEqual(serialized.scopes['client|calendar'].events,[]);
 const snapshot=createDriveSnapshot(state);
 assert.deepEqual(snapshot.master['client|calendar'].metadata['肉じゃが'].ingredients,[item]);
 const receiver=structuredClone(state);receiver.scopes['client|calendar'].metadata={};
 restoreDriveSnapshot(receiver,readDriveSnapshot(snapshot,receiver,()=>{}));
 assert.deepEqual(receiver.scopes['client|calendar'].metadata['肉じゃが'].ingredients,[item]);
 assert.throws(()=>readDriveSnapshot({...snapshot,master:{'client|calendar':{aliases:{},manual:[],metadata:{'肉じゃが':{ingredients:[{name:'肉',quantity:-2,unit:'g'}]}}}}},receiver,()=>{}),/数量/);
});

test('master editor exposes AI generation and manual ingredient inputs with save validation',()=>{
 assert.match(app,/function ingredientRow\(/);
 assert.match(app,/id="master-ingredients"/);
 assert.match(app,/材料（1人前）/);
 assert.match(app,/AIで材料を生成/);
 assert.match(app,/'add-master-ingredient':/);
 assert.match(app,/'remove-master-ingredient':/);
 assert.match(app,/'generate-master-ingredients':generateMasterIngredients/);
 assert.match(app,/const ingredients=validateIngredients\(readIngredientRows\(\)\)/);
 assert.match(app,/ingredients\};/);
 assert.match(app,/const ingredients=await ai\.generateIngredients\(name\)/);
 assert.match(app,/redrawIngredientRows\(ingredients\)/);
 assert.match(css,/\.master-ingredient-row\{display:grid/);
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(sw,/\.\/src\/ingredients\.js/);
 assert.match(sw,/\.\/src\/ai-ingredients\.js/);
});
