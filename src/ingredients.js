import {normalize} from './model.js';

// Cooking-volume conversions follow Japanese measuring utensils. No food-density
// guess is used: g and ml must remain separate even for the same ingredient.
export const INGREDIENT_UNITS=Object.freeze(['g','kg','ml','L','大さじ','小さじ','カップ','個','本','枚','片','袋','パック','束','丁','玉','株','合','適量','少々','ひとつまみ']);
const factors=Object.freeze({'kg':['g',1000],'L':['ml',1000],'大さじ':['ml',15],'小さじ':['ml',5],'カップ':['ml',200]});
const nonNumeric=new Set(['適量','少々','ひとつまみ']);
const aliases=Object.freeze({'グラム':'g','ｇ':'g','キログラム':'kg','ミリリットル':'ml','リットル':'L','かけ':'片','欠片':'片'});
export function canonicalIngredientUnit(value){
 const raw=String(value??'').trim();
 return aliases[raw]||raw;
}
export const MAX_INGREDIENTS=60;

export function parseIngredientQuantity(value){
 if(value==null||String(value).trim()==='')return null;
 if(typeof value==='number')return Number.isFinite(value)?value:NaN;
 const s=String(value).trim().normalize('NFKC');
 // Allow fractions such as 1/2 and 1 1/2, but never evaluate expressions.
 const mixed=/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
 if(mixed)return Number(mixed[3])?Number(mixed[1])+Number(mixed[2])/Number(mixed[3]):NaN;
 const fraction=/^(\d+)\s*\/\s*(\d+)$/.exec(s);
 if(fraction)return Number(fraction[2])?Number(fraction[1])/Number(fraction[2]):NaN;
 return /^\d+(?:\.\d+)?$/.test(s)?Number(s):NaN;
}

export function normalizeIngredient(item){
 if(!item||typeof item!=='object')throw Error('材料の入力形式が不正です。');
 const name=String(item.name??'').trim();
 if(!name||name.length>80||/[\x00-\x1f\x7f]/.test(name))throw Error('材料名を1〜80文字で入力してください。');
 const unit=canonicalIngredientUnit(item.unit);
 if(!unit||unit.length>24||/[\x00-\x1f\x7f<>]/.test(unit))throw Error(name+'の単位を1〜24文字で入力してください。');
 const quantity=parseIngredientQuantity(item.quantity);
 if(nonNumeric.has(unit)){
  if(quantity!==null)throw Error(name+'は数量を空欄にして「'+unit+'」を選択してください。');
 }else if(quantity===null||!Number.isFinite(quantity)||quantity<=0||quantity>100000)
  throw Error(name+'の数量は0より大きい数値（1/2なども可）で入力してください。');
 const [baseUnit,factor]=factors[unit]||[unit,1];
 const baseQuantity=quantity===null?null:Math.round(quantity*factor*1000000)/1000000;
 return {name,quantity,unit,baseQuantity,baseUnit};
}
export function validateIngredients(items){
 if(!Array.isArray(items)||items.length>MAX_INGREDIENTS)throw Error('材料は最大60件まで登録できます。');
 const result=[],seen=new Set();
 for(const item of items){
  const valid=normalizeIngredient(item);
  const key=normalize(valid.name)+'|'+valid.baseUnit;
  if(seen.has(key))throw Error('同じ材料と単位が重複しています：'+valid.name+'。一つにまとめてください。');
  seen.add(key);
  result.push(valid);
 }
 return result;
}
export function ingredientTotal(items){
 // Forward-compatible quantity rollup. Unit families are intentionally not
 // mixed, and unknown/approximate amounts are excluded from numeric sums.
 const totals=new Map();
 for(const entry of items){
  const i=normalizeIngredient(entry);
  const key=normalize(i.name)+'|'+i.baseUnit;
  const prev=totals.get(key);
  if(prev&&i.baseQuantity!=null&&prev.baseQuantity!=null)prev.baseQuantity=Math.round((prev.baseQuantity+i.baseQuantity)*1000000)/1000000;
  else if(!prev)totals.set(key,{name:i.name,baseUnit:i.baseUnit,baseQuantity:i.baseQuantity});
 }
 return [...totals.values()];
}
