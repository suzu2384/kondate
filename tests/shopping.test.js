import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shoppingItems,shoppingSettings,quantityLabel,validateShoppingSettings,DEFAULT_SHOPPING_SERVINGS} from '../src/shopping.js';
import {storedState} from '../src/storage.js';
import {createDriveSnapshot,readDriveSnapshot,restoreDriveSnapshot} from '../src/drive-backup.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const base=[
 {name:'肉じゃが',key:'肉じゃが',ingredients:[
  {name:'醤油',quantity:1,unit:'大さじ'},{name:'玉ねぎ',quantity:0.25,unit:'個'},
  {name:'牛肉',quantity:60,unit:'g'},{name:'砂糖',quantity:1,unit:'小さじ'}]},
 {name:'鶏の照り焼き',key:'鶏の照り焼き',ingredients:[
  {name:'しょうゆ',quantity:2,unit:'小さじ'},{name:'玉ねぎ',quantity:0.5,unit:'個'},
  {name:'牛肉',quantity:0.1,unit:'kg'}]},
 {name:'材料なし',key:'材料なし',ingredients:[]}
];
const draft=[{dishes:[{name:'肉じゃが'},{name:'鶏の照り焼き'}]},{dishes:[{name:'肉じゃが'},{name:'材料なし'},{name:'未登録料理'}]}];
const input=(options={})=>({master:base,draft,shopping:{servings:5,manual:[],checked:{},excluded:{},...options}});

test('shopping defaults to five servings and aggregates planned dishes across days',()=>{
 assert.equal(shoppingSettings().servings,DEFAULT_SHOPPING_SERVINGS);
 const view=shoppingItems(input());
 const item=name=>view.items.find(x=>x.name===name);
 assert.equal(view.missing.length,2);
 assert.equal(view.missing[0].name,'材料なし');
 assert.equal(view.missing[1].name,'未登録料理');
 assert.equal(item('醤油').display,'200 ml'); // (15 + 10 + 15) × 5
 assert.equal(item('玉ねぎ').display,'5 個'); // (0.25 + 0.5 + 0.25) × 5
 assert.equal(item('牛肉').display,'1.1 kg'==='1.1 kg'?'1100 g':''); // 2 × 60 g plus 100 g, times 5
 assert.equal(item('砂糖').display,'10 ml');
 assert.ok(item('醤油').sourceNames.includes('肉じゃが'));
 assert.ok(item('醤油').sourceNames.includes('鶏の照り焼き'));
 assert.equal(view.pending.length,4);
});

test('shopping recalculates when servings change without modifying meal recipes',()=>{
 const five=shoppingItems(input());
 const two=shoppingItems(input({servings:2}));
 assert.equal(five.items.find(x=>x.name==='醤油').baseQuantity,200);
 assert.equal(two.items.find(x=>x.name==='醤油').baseQuantity,80);
 assert.equal(base[0].ingredients[0].quantity,1);
 assert.equal(two.missing.length,2);
});

test('g and ml are never combined even when their ingredient name is the same',()=>{
 const view=shoppingItems({draft:[{dishes:[{name:'料理'}]}],
  master:[{name:'料理',ingredients:[{name:'醤油',quantity:15,unit:'ml'},{name:'醤油',quantity:10,unit:'g'}]}],
  shopping:{servings:1}});
 const soy=view.items.filter(x=>x.name==='醤油');
 assert.equal(soy.length,2);
 assert.deepEqual(soy.map(x=>x.baseUnit).sort(),['g','ml']);
});

test('purchase checks survive unchanged quantities but reset if ingredients/servings change',()=>{
 const view=shoppingItems(input());
 const soy=view.items.find(x=>x.name==='醤油');
 const mark={[soy.id]:soy.signature};
 assert.equal(shoppingItems(input({checked:mark})).bought.length,1);
 assert.equal(shoppingItems(input({checked:mark,servings:2})).bought.length,0);
 const removed=shoppingItems(input({excluded:{[soy.id]:true}}));
 assert.equal(removed.pending.some(x=>x.name==='醤油'),false);
 assert.equal(removed.excluded.some(x=>x.name==='醤油'),true);
 // No automatic condiment exclusions, even sugar.
 assert.equal(view.pending.some(x=>x.name==='砂糖'),true);
 assert.equal(removed.pending.some(x=>x.name==='砂糖'),true);
});

test('manual items are independent of menu and can be bought or excluded',()=>{
 const manual={id:'abcdef012345',name:'牛乳',quantity:1,unit:'L'};
 const view=shoppingItems({draft:[],master:[],shopping:{servings:3,manual:[manual]}});
 assert.equal(view.pending.length,1);
 assert.equal(view.items[0].display,'1000 ml');
 assert.equal(view.items[0].id,'manual:abcdef012345');
 const checked={[view.items[0].id]:view.items[0].signature};
 assert.equal(shoppingItems({shopping:{manual:[manual],checked}}).bought.length,1);
 const raw=shoppingSettings({servings:3,manual:[manual],checked});
 assert.equal(raw.servings,3);
});

test('malformed shopping settings or manual quantities cannot be imported',()=>{
 assert.throws(()=>validateShoppingSettings({servings:0}),/1〜30/);
 assert.throws(()=>validateShoppingSettings({servings:31}),/1〜30/);
 assert.throws(()=>validateShoppingSettings({manual:[{id:'a',name:'醤油',unit:'ml',quantity:1}]}),/ID/);
 assert.throws(()=>validateShoppingSettings({manual:[{id:'abcdef012345',name:'牛乳',unit:'invalid',quantity:1}]}),/単位/);
 assert.throws(()=>validateShoppingSettings({excluded:{'abc':'yes'}}),/形式/);
 assert.doesNotThrow(()=>validateShoppingSettings({servings:5,manual:[]}));
});

test('shopping list and checked/excluded/manual items round-trip in local and Drive data',()=>{
 const shopping={servings:5,manual:[{id:'abcdef012345',name:'納豆',quantity:3,unit:'パック'}],
  checked:{'manual:abcdef012345':'パック:3'},excluded:{'auto:醤油|ml':true}};
 const state={timeZone:'Asia/Tokyo',from:'2026-01-01',categories:[{id:'main',name:'主菜'}],
  rules:{days:7,oldDays:30,recentDays:7,preferOld:true,excludeRecent:true,unique:true,balance:true,newMain:true,counts:{main:1}},
  draft:[{dishes:[{name:'肉じゃが',category:'main'}]}],
  shopping,scopes:{'client|calendar':{events:[],aliases:{},metadata:{},manual:[]}}};
 assert.deepEqual(storedState(state).shopping,shopping);
 const snapshot=createDriveSnapshot(state);
 assert.deepEqual(snapshot.settings.shopping,shopping);
 const recipient=structuredClone(state);
 recipient.shopping={servings:1,manual:[],checked:{},excluded:{}};
 restoreDriveSnapshot(recipient,readDriveSnapshot(snapshot,recipient,()=>{}));
 assert.deepEqual(recipient.shopping,shopping);
 const bad=structuredClone(snapshot);
 bad.settings.shopping.manual[0].quantity=-3;
 assert.throws(()=>readDriveSnapshot(bad,recipient,()=>{}),/数量/);
});

test('record nav is removed; shopping UI contains servings, checklist, missing recipes, and manual editor',()=>{
 const html=read('index.html'),app=read('src/app.js'),css=read('style.css');
 assert.match(html,/data-tab="shopping"/);
 assert.doesNotMatch(html,/data-tab="photo"|>記録<\/button>/);
 assert.match(app,/shopping:shoppingScreen/);
 assert.doesNotMatch(app,/photo:photoScreen/);
 for(const action of ["shopping-add","shopping-edit","shopping-save","shopping-delete","shopping-exclude","shopping-restore","shopping-clear-checks","shopping-copy","shopping-open-master"])
  assert.ok(app.includes("'"+action+"'"),action);
 assert.match(app,/id="shopping-servings"/);
 assert.match(app,/data-shopping-check/);
 assert.match(app,/材料未登録の料理/);
 assert.match(app,/未購入をコピー/);
 assert.match(css,/nav-icon-shopping/);
 assert.match(css,/\.shopping-list\{flex:1 1 auto/);
});
