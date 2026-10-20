import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {priceKey,validatePrice,validatePrices,catalogPrices,estimateItem,shoppingBudget} from '../src/ingredient-prices.js';
import {shoppingSettings,validateShoppingSettings,shoppingItems} from '../src/shopping.js';
import {applyShoppingEvents} from '../src/family-data.js';
import {createDriveSnapshot,readDriveSnapshot,restoreDriveSnapshot} from '../src/drive-backup.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const onions={name:'玉ねぎ',quantity:3,unit:'個',price:198};
const meat={name:'豚肉',quantity:100,unit:'g',price:158};
const prices={[priceKey(onions.name)]:onions,[priceKey(meat.name)]:meat};

test('price entries validate quantity, unit, price, key and aliases',()=>{
 assert.equal(priceKey('タマネギ'),priceKey('玉ねぎ'));
 assert.deepEqual(validatePrice(onions),onions);
 for(const value of [-1,2.5,10000001,'',null,undefined]){
  assert.throws(()=>validatePrice({...onions,price:value}),/価格/);
 }
 assert.throws(()=>validatePrice({...onions,quantity:0}),/数量/);
 assert.throws(()=>validatePrice({...onions,unit:'少々',quantity:''}),/数量/);
 assert.throws(()=>validateShoppingSettings({prices:{wrong:onions}}),/食材名/);
 assert.throws(()=>validatePrices({[priceKey(onions.name)]:{...onions,price:-1}}),/価格/);
 assert.doesNotThrow(()=>validateShoppingSettings({prices}));
});

test('list prices round up whole packages, scale weight, do not guess incompatible units',()=>{
 const estimate=(name,baseQuantity,baseUnit)=>estimateItem({name,baseQuantity,baseUnit},prices);
 assert.equal(estimate('玉ねぎ',2,'個').amount,198);
 assert.equal(estimate('玉ねぎ',4,'個').amount,396);
 assert.equal(estimate('タマネギ',3,'個').amount,198);
 assert.equal(estimate('豚肉',400,'g').amount,632);
 assert.equal(estimate('豚肉',1,'kg').amount,null);
 assert.equal(estimate('玉ねぎ',500,'g').amount,null);
 assert.equal(estimate('キャベツ',1,'玉').amount,null);
 const budget=shoppingBudget([{name:'玉ねぎ',baseQuantity:4,baseUnit:'個'},
  {name:'豚肉',baseQuantity:400,baseUnit:'g'},
  {name:'キャベツ',baseQuantity:1,baseUnit:'玉'}],prices);
 assert.deepEqual(budget,{total:1028,unknown:1,priced:2,count:3});
});

test('catalog includes every recipe ingredient, manually added items and older saved prices',()=>{
 const recipes=[{name:'カレー',ingredients:[{name:'玉ねぎ',quantity:1,unit:'個'},
  {name:'豚肉',quantity:100,unit:'g'}]},{name:'未選択',ingredients:[{name:'人参',quantity:1,unit:'本'}]}];
 const items=[{name:'玉ねぎ',baseUnit:'個',baseQuantity:2}];
 const catalog=catalogPrices(recipes,[{name:'牛乳',quantity:1,unit:'L'}],items,{
  [priceKey('豚肉')]:meat,[priceKey('じゃがいも')]:{name:'じゃがいも',quantity:5,unit:'個',price:298}
 });
 assert.deepEqual(new Set(catalog.map(c=>c.name)),new Set(['玉ねぎ','豚肉','人参','牛乳','じゃがいも']));
 assert.equal(catalog.find(c=>c.name==='豚肉').registered,true);
});

test('prices survive Drive backups and family shopping checklist updates',()=>{
 const state={shopping:shoppingSettings({selected:['カレー'],prices}),scopes:{}};
 assert.deepEqual(shoppingSettings(state.shopping).prices,prices);
 const snapshot=createDriveSnapshot(state);
 assert.deepEqual(snapshot.settings.shopping.prices,prices);
 const restored={...state,shopping:shoppingSettings()};
 restoreDriveSnapshot(restored,readDriveSnapshot(snapshot,restored,()=>{}));
 assert.deepEqual(restored.shopping.prices,prices);
 const updated=applyShoppingEvents(restored.shopping,[{key:'servings',value:3}],false);
 assert.deepEqual(updated.prices,prices);
 const reset=applyShoppingEvents(restored.shopping,[{key:'servings',value:3}],true);
 assert.deepEqual(reset.prices,{});
});

test('shopping tab uses provided icons, preserves existing controls and exposes price search',()=>{
 const app=read('src/app.js'),css=read('style.css'),sw=read('sw.js');
 const screen=app.slice(app.indexOf('function shoppingScreen()'),app.indexOf('function editShoppingPrice('));
 assert.ok(screen.indexOf('shoppingModeButtons()')<screen.indexOf('shopping-servings'));
 assert.match(screen,/未購入の予算目安/);
 assert.match(screen,/shopping-price-search/);
 for(const text of ['＋ 品目追加','未購入をコピー','買い物に必要な人数','data-kind="shopping"'])
  assert.ok(screen.includes(text));
 assert.match(app,/'shopping-mode':b=>/);
 assert.match(app,/'shopping-price-save':b=>/);
 assert.match(app,/'shopping-price-delete':b=>/);
 assert.match(css,/shopping-mode-icon-shopping-basket/);
 assert.match(css,/shopping-mode-icon-receipt-japanese-yen/);
 assert.match(sw,/src\/ingredient-prices.js/);
 for(const path of ['icons/actions/shopping-basket.svg','icons/actions/receipt-japanese-yen.svg']){
  assert.match(read(path),/<svg/);
  assert.ok(sw.includes("'./"+path+"'"));
 }
});
