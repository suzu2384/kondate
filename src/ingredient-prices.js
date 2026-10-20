import {normalize} from './model.js';
import {normalizeIngredient} from './ingredients.js';

// These match the canonical ingredient names already used by the shopping list.
const aliases=new Map([['しょうゆ','醤油'],['しょう油','醤油'],['醤油','醤油'],
 ['ジャガイモ','じゃがいも'],['じゃがいも','じゃがいも'],
 ['たまねぎ','玉ねぎ'],['タマネギ','玉ねぎ'],['玉ねぎ','玉ねぎ'],
 ['人参','にんじん'],['ニンジン','にんじん'],['にんじん','にんじん']]);
export function priceKey(name){
 const raw=String(name??'').trim();
 return normalize(aliases.get(raw)||raw);
}
export const MAX_PRICES=300;
export function validatePrice(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('食材価格の形式が不正です。');
 const ingredient=normalizeIngredient(input);
 if(ingredient.baseQuantity===null)throw Error('価格の購入数量を指定してください。');
 const price=Number(input.price);
 if(input.price===null||input.price===undefined||String(input.price).trim()===''||
    !Number.isInteger(price)||price<0||price>10000000)
  throw Error('食材価格は0〜1000万円の整数で入力してください。');
 return {name:ingredient.name,quantity:ingredient.quantity,unit:ingredient.unit,price};
}
export function validatePrices(prices){
 if(!prices||typeof prices!=='object'||Array.isArray(prices)||Object.keys(prices).length>MAX_PRICES)
  throw Error('食材価格は最大300件です。');
 const result=Object.create(null);
 for(const [key,raw] of Object.entries(prices)){
  const safe=validatePrice(raw);
  if(key!==priceKey(safe.name)||!key||key.length>100||['__proto__','prototype','constructor'].includes(key))
   throw Error('食材価格の食材名が不正です。');
  result[key]=safe;
 }
 return result;
}
export function catalogPrices(master=[],manual=[],shoppingItems=[],prices={}){
 const result=new Map();
 function add(name,unit){
  const key=priceKey(name);
  if(!key||key.length>100)return;
  if(!result.has(key))result.set(key,{key,name:String(name).trim(),unit:unit||'個'});
 }
 for(const dish of master){
  for(const ingredient of Array.isArray(dish.ingredients)?dish.ingredients:[]){
   try{const normalized=normalizeIngredient(ingredient);add(normalized.name,normalized.baseUnit);}catch{}
  }
 }
 for(const ingredient of manual){
  try{const normalized=normalizeIngredient(ingredient);add(normalized.name,normalized.baseUnit);}catch{}
 }
 for(const item of shoppingItems)add(item.name,item.baseUnit);
 for(const [key,entry] of Object.entries(prices)){
  if(!entry||!key)continue;
  result.set(key,{key,name:entry.name,unit:entry.unit,registered:true});
 }
 return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja'));
}
export function estimateItem(item,prices={}){
 const price=prices[priceKey(item.name)];
 if(!price)return {amount:null,reason:'価格未設定'};
 let checked;
 try{checked=validatePrice(price);}catch{return {amount:null,reason:'価格を確認'};}
 const purchase=normalizeIngredient(checked);
 if(item.baseUnit!==purchase.baseUnit||item.baseQuantity===null||
    !Number.isFinite(item.baseQuantity)||item.baseQuantity<=0)
  return {amount:null,reason:'単位が異なるため計算不可'};
 // Weight and volume are variable quantities; packages and countable units
 // must be bought whole, and fractional demand rounds up to the next pack.
 const ratio=item.baseQuantity/purchase.baseQuantity;
 const amount=['g','ml'].includes(purchase.baseUnit)?
  Math.ceil(ratio*checked.price):Math.ceil(ratio-1e-10)*checked.price;
 return {amount,reason:'',price:checked};
}
export function shoppingBudget(items=[],prices={}){
 let total=0,unknown=0,priced=0;
 for(const item of items){
  const value=estimateItem(item,prices);
  if(value.amount===null)unknown++;
  else{total+=value.amount;priced++;}
 }
 return {total,unknown,priced,count:items.length};
}
