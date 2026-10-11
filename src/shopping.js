import {normalize,resolveName} from './model.js';
import {normalizeIngredient} from './ingredients.js';

export const DEFAULT_SHOPPING_SERVINGS=5;
const aliases=new Map([
 ['しょうゆ','醤油'],['しょう油','醤油'],['醤油','醤油'],
 ['じゃがいも','じゃがいも'],['ジャガイモ','じゃがいも'],
 ['たまねぎ','玉ねぎ'],['玉ねぎ','玉ねぎ'],['タマネギ','玉ねぎ'],
 ['にんじん','にんじん'],['人参','にんじん'],['ニンジン','にんじん']
]);
function ingredientName(name){return aliases.get(String(name).trim())||String(name).trim();}
function itemKey(name,baseUnit){return normalize(ingredientName(name))+'|'+baseUnit;}
function rounded(value){return Math.round(value*1000000)/1000000;}
function plainObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
export function shoppingSettings(input={}){
 const value=plainObject(input);
 const servings=Number(value.servings);
 return {
  servings:Number.isInteger(servings)&&servings>=1&&servings<=30?servings:DEFAULT_SHOPPING_SERVINGS,
  manual:Array.isArray(value.manual)?value.manual.filter(item=>item&&typeof item==='object').slice(0,200):[],
  selected:Array.isArray(value.selected)?value.selected.filter(name=>typeof name==='string'&&name.trim()).slice(0,200):[],
  checked:{...plainObject(value.checked)},
  excluded:{...plainObject(value.excluded)}
 };
}
export function quantityLabel(item){
 if(item.baseQuantity===null)return item.baseUnit;
 const q=rounded(item.baseQuantity);
 // Display one consistent baseline for summation, without falsely rounding
 // fractional produce up to whole items or confusing g and ml.
 return String(q)+' '+item.baseUnit;
}
/** Selection is explicit, persisted independently of the generated menu. */
export function addShoppingDish(selected,name){
 const dish=String(name||'').trim();
 if(!dish||dish.length>100)throw Error('料理名が不正です。');
 const current=Array.isArray(selected)?selected:[];
 return current.some(n=>normalize(n)===normalize(dish))?[...current]:[...current,dish];
}
export function removeShoppingDish(selected,name){
 return (Array.isArray(selected)?selected:[]).filter(n=>normalize(n)!==normalize(name));
}
export function shoppingItems({master=[],aliases:mealAliases={},shopping={}}={}){
 const settings=shoppingSettings(shopping);
 const known=new Map(master.map(item=>[item.key||normalize(item.name),item]));
 const aggregated=new Map(),selected=[];
 for(const name of settings.selected){
  const matched=known.get(normalize(resolveName(name,mealAliases)));
  let ingredients=[];
  try {
   if(Array.isArray(matched?.ingredients))ingredients=matched.ingredients.map(normalizeIngredient);
  }catch {ingredients=[];}
  const available=ingredients.length>0;
  selected.push({name:matched?.name||name,selectedName:name,available});
  if(!available)continue;
  for(const item of ingredients){
   const group=itemKey(item.name,item.baseUnit),key='auto:'+group;
   if(!aggregated.has(group))aggregated.set(group,{
    id:key,kind:'auto',name:ingredientName(item.name),
    baseUnit:item.baseUnit,baseQuantity:0,sourceNames:new Set()
   });
   const entry=aggregated.get(group);
   if(item.baseQuantity===null)entry.baseQuantity=null;
   else if(entry.baseQuantity!==null)entry.baseQuantity=rounded(entry.baseQuantity+item.baseQuantity*settings.servings);
   entry.sourceNames.add(matched.name);
  }
 }
 const automatic=[...aggregated.values()].map(item=>({...item,sourceNames:[...item.sourceNames]}));
 const manual=settings.manual.flatMap(item=>{
  try{
   const data=normalizeIngredient(item);
   if(!/^[a-z0-9-]{6,40}$/.test(String(item.id||'')))return [];
   return [{...data,id:'manual:'+item.id,kind:'manual',sourceNames:[]}];
  }catch{return [];}
 });
 const decorate=item=>{
  const signature=item.baseUnit+':'+String(item.baseQuantity);
  return {...item,signature,checked:settings.checked[item.id]===signature,
   excluded:settings.excluded[item.id]===true,
   display:quantityLabel(item)};
 };
 const items=[...automatic,...manual].map(decorate)
  .sort((a,b)=>a.name.localeCompare(b.name,'ja')||a.baseUnit.localeCompare(b.baseUnit,'ja'));
 return {items,selected,servings:settings.servings,
  pending:items.filter(x=>!x.checked&&!x.excluded),
  bought:items.filter(x=>x.checked&&!x.excluded),
  excluded:items.filter(x=>x.excluded)};
}
export function validateShoppingSettings(settings){
 const raw=plainObject(settings);
 if(raw.servings!==undefined&&(!Number.isInteger(Number(raw.servings))||Number(raw.servings)<1||Number(raw.servings)>30))throw Error('買い物人数は1〜30人で指定してください。');
 if(raw.selected!==undefined){
  if(!Array.isArray(raw.selected)||raw.selected.length>200)throw Error('買い物対象の料理は最大200品です。');
  const seen=new Set();
  for(const name of raw.selected){
   if(typeof name!=='string'||!name.trim()||name.length>100||[...name].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||seen.has(normalize(name)))
    throw Error('買い物対象の料理が不正または重複しています。');
   seen.add(normalize(name));
  }
 }
 if(raw.manual!==undefined){
  if(!Array.isArray(raw.manual)||raw.manual.length>200)throw Error('手動追加できる品目は最大200件です。');
  const ids=new Set();
  for(const item of raw.manual){
   if(!/^[a-z0-9-]{6,40}$/.test(String(item?.id||''))||ids.has(item.id))throw Error('買い物リストの品目IDが不正です。');
   ids.add(item.id);normalizeIngredient(item);
  }
 }
 for(const key of ['checked','excluded']){
  if(raw[key]===undefined)continue;
  if(!raw[key]||typeof raw[key]!=='object'||Array.isArray(raw[key])||Object.keys(raw[key]).length>5000)throw Error('買い物リストの保存形式が不正です。');
  for(const [id,value] of Object.entries(raw[key])){
   if(id.length>256||(key==='checked'&&(typeof value!=='string'||value.length>90))||(key==='excluded'&&typeof value!=='boolean'))
    throw Error('買い物リストの保存形式が不正です。');
  }
 }
 return shoppingSettings(raw);
}
