import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shoppingItems,shoppingSettings,quantityLabel,validateShoppingSettings,DEFAULT_SHOPPING_SERVINGS,addShoppingDish,removeShoppingDish} from '../src/shopping.js';
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
const input=(options={})=>({master:base,draft,shopping:{servings:5,selected:[],manual:[],checked:{},excluded:{},...options}});

test('generating or replacing menus never adds anything to shopping',()=>{
 assert.equal(shoppingSettings().servings,DEFAULT_SHOPPING_SERVINGS);
 for(const menu of [[],draft,[{dishes:[{name:'肉じゃが'}]}]]){
  const view=shoppingItems({...input(),draft:menu});
  assert.equal(view.pending.length,0);
  assert.equal(view.selected.length,0);
  assert.equal(view.missing,undefined);
 }
});

test('one explicitly bought dish contributes one recipe regardless of repeated menu days',()=>{
 const view=shoppingItems(input({selected:['肉じゃが']}));
 assert.deepEqual(view.selected.map(d=>d.name),['肉じゃが']);
 assert.equal(view.pending.length,4);
 const ingredient=name=>view.items.find(i=>i.name===name);
 assert.equal(ingredient('醤油').display,'75 ml');
 assert.equal(ingredient('玉ねぎ').display,'1.25 個');
 assert.equal(ingredient('牛肉').display,'300 g');
 assert.equal(ingredient('砂糖').display,'25 ml');
 const again=shoppingItems({...input({selected:['肉じゃが']}),draft:[]});
 assert.deepEqual(again.items,view.items);
});

test('multiple selected dishes aggregate equivalent ingredients without mixing unit families',()=>{
 const view=shoppingItems(input({selected:['肉じゃが','鶏の照り焼き']}));
 const item=name=>view.items.find(i=>i.name===name);
 assert.equal(item('醤油').display,'125 ml');
 assert.equal(item('玉ねぎ').display,'3.75 個');
 assert.equal(item('牛肉').display,'800 g');
 assert.deepEqual(item('醤油').sourceNames,['肉じゃが','鶏の照り焼き']);
 const more=shoppingItems({master:[{name:'料理',ingredients:[{name:'醤油',quantity:1,unit:'大さじ'},{name:'醤油',quantity:8,unit:'g'}]}],shopping:{selected:['料理'],servings:1}});
 assert.equal(more.items.filter(i=>i.name==='醤油').length,2);
});

test('adding an already selected dish is idempotent; removing recalculates totals',()=>{
 const first=addShoppingDish([], '肉じゃが');
 assert.deepEqual(first,['肉じゃが']);
 assert.deepEqual(addShoppingDish(first,' 肉じゃが '),first);
 const chosen=addShoppingDish(first,'鶏の照り焼き');
 const before=shoppingItems(input({selected:chosen}));
 const after=shoppingItems(input({selected:removeShoppingDish(chosen,'肉じゃが')}));
 assert.equal(before.items.find(i=>i.name==='醤油').baseQuantity,125);
 assert.equal(after.items.find(i=>i.name==='醤油').baseQuantity,50);
 assert.deepEqual(after.selected.map(i=>i.name),['鶏の照り焼き']);
});

test('missing or invalid recipes are not added to totals and do not produce warnings',()=>{
 const view=shoppingItems(input({selected:['材料なし','未登録料理']}));
 assert.equal(view.items.length,0);
 assert.equal(view.missing,undefined);
 assert.equal(view.selected.length,2);
 assert.equal(view.selected[0].available,false);
 assert.equal(view.selected[1].available,false);
 // Resolving an existing renamed recipe follows its master alias.
 const aliased=shoppingItems({master:base,aliases:{'旧肉じゃが':'肉じゃが'},shopping:{selected:['旧肉じゃが'],servings:1}});
 assert.equal(aliased.pending.length,4);
 assert.equal(aliased.selected[0].name,'肉じゃが');
});

test('purchase checks, manual items and exclusions are preserved',()=>{
 const view=shoppingItems(input({selected:['肉じゃが']}));
 const soy=view.items.find(i=>i.name==='醤油');
 const checked={[soy.id]:soy.signature};
 assert.equal(shoppingItems(input({selected:['肉じゃが'],checked})).bought.length,1);
 assert.equal(shoppingItems(input({selected:['肉じゃが'],servings:2,checked})).bought.length,0);
 const excluded=shoppingItems(input({selected:['肉じゃが'],excluded:{[soy.id]:true}}));
 assert.equal(excluded.pending.some(i=>i.name==='醤油'),false);
 assert.equal(excluded.excluded.some(i=>i.name==='醤油'),true);
 assert.equal(excluded.pending.some(i=>i.name==='砂糖'),true);
 const manual={id:'abcdef012345',name:'牛乳',quantity:1,unit:'L'};
 const only=shoppingItems({master:[],shopping:{manual:[manual],servings:3}});
 assert.equal(only.items[0].display,'1000 ml');
 assert.equal(only.pending[0].id,'manual:abcdef012345');
});

test('selected recipe names are validated for backup safety and uniqueness',()=>{
 assert.throws(()=>validateShoppingSettings({servings:0}),/1〜30/);
 assert.throws(()=>validateShoppingSettings({selected:['肉じゃが','肉じゃが']}),/重複/);
 assert.throws(()=>validateShoppingSettings({selected:['\u0000evil']}),/不正/);
 assert.throws(()=>validateShoppingSettings({selected:[42]}),/不正/);
 assert.throws(()=>validateShoppingSettings({selected:Array.from({length:201},(_,i)=>'料理'+i)}),/最大200/);
 assert.throws(()=>validateShoppingSettings({manual:[{id:'abcdef012345',name:'醤油',unit:'unknown',quantity:1}]}),/単位/);
 assert.throws(()=>validateShoppingSettings({excluded:{'abc':'yes'}}),/形式/);
 assert.doesNotThrow(()=>validateShoppingSettings({selected:['肉じゃが'],servings:5}));
});

test('selected dishes roundtrip in local settings and Drive backup',()=>{
 const shopping={servings:5,selected:['肉じゃが'],manual:[{id:'abcdef012345',name:'納豆',quantity:3,unit:'パック'}],
  checked:{'manual:abcdef012345':'パック:3'},excluded:{'auto:醤油|ml':true}};
 const state={timeZone:'Asia/Tokyo',from:'2026-01-01',categories:[{id:'main',name:'主菜'}],
  rules:{days:7,oldDays:30,recentDays:7,preferOld:true,excludeRecent:true,unique:true,balance:true,newMain:true,counts:{main:1}},
  draft,shopping,scopes:{'client|calendar':{events:[],aliases:{},metadata:{},manual:[]}}};
 assert.deepEqual(storedState(state).shopping,shopping);
 const snapshot=createDriveSnapshot(state);
 assert.deepEqual(snapshot.settings.shopping,shopping);
 const recipient=structuredClone(state);recipient.shopping={servings:1,selected:[],manual:[],checked:{},excluded:{}};
 restoreDriveSnapshot(recipient,readDriveSnapshot(snapshot,recipient,()=>{}));
 assert.deepEqual(recipient.shopping,shopping);
 const bad=structuredClone(snapshot);bad.settings.shopping.selected.push('肉じゃが');
 assert.throws(()=>readDriveSnapshot(bad,recipient,()=>{}),/重複/);
});

test('shopping tab displays ingredient checklist, while 料理 tab manages shopping dishes',()=>{
 const html=read('index.html'),app=read('src/app.js'),css=read('style.css');
 assert.match(html,/data-tab="shopping"/);
 assert.match(app,/'buy-master':buyMasterDish/);
 assert.match(app,/editMaster\(existing\?\.key\|\|null,\{buy:true/);
 assert.match(app,/if\(buy&&ingredients\.length\)state\.shopping\.selected=addShoppingDish/);
 const masterScreen=app.slice(app.indexOf('function masterScreen()'),app.indexOf('function refreshMasterRows()'));
 assert.match(masterScreen,/filterButton\('買い物','shopping'\)/);
 assert.match(app,/masterFilterItems\(master\(\),state\.draft,masterFilter,data\(\)\.aliases,state\.shopping\.selected\)/);
 const shoppingScreen=app.slice(app.indexOf('function shoppingScreen()'),app.indexOf('function editShoppingManual('));
 assert.doesNotMatch(shoppingScreen,/買い物対象の料理|shopping-selected|shopping-remove-dish|shopping-edit-dish/);
 assert.match(shoppingScreen,/未購入をコピー/);
 assert.match(app,/state\.shopping\.selected\.filter\(selected=>/);
 assert.doesNotMatch(app,/材料未登録の料理（|const missing=view\.missing/);
 assert.match(css,/\.master-screen \.master-filter-button\.selected/);
});
