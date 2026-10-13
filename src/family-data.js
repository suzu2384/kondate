import {normalize,MAX_GENERATION_DAYS,validateDishes} from './model.js';
import {shoppingSettings} from './shopping.js';
import {validateIngredients} from './ingredients.js';

// Only menu identity, recipe attributes, and ingredient amounts are shared.
// No Calendar event, history date, OAuth token, or app setting is exported.
export function masterSharedSnapshot(rows=[]){
 const out={};
 for(const d of rows){
  const key=normalize(d.name);
  if(!key)continue;
  out['dish:'+key]={name:d.name,category:d.category,protein:d.protein||'不明',
   method:d.method||'不明',genre:d.genre||'不明',categoryName:String(d.categoryName||d.category),
   ingredients:Array.isArray(d.ingredients)?validateIngredients(d.ingredients).map(i=>({
    name:i.name,quantity:i.quantity,unit:i.unit
   })):[]};
 }
 return out;
}
export function shoppingSharedSnapshot(input={},computed=[]){
 const s=shoppingSettings(input),out={servings:s.servings};
 for(const i of computed.filter(i=>i.kind==='auto')){
  out['ingredient:'+i.id]={id:i.id,kind:'auto',name:i.name,
   baseUnit:i.baseUnit,baseQuantity:i.baseQuantity,sourceNames:i.sourceNames||[]};
 }
 for(const name of s.selected)out['selected:'+normalize(name)]=name;
 for(const i of s.manual)out['manual:'+i.id]={...i};
 for(const [id,value] of Object.entries(s.checked))out['checked:'+id]=value;
 for(const [id,value] of Object.entries(s.excluded))if(value)out['excluded:'+id]=true;
 return out;
}
export function applyShoppingEvents(input={},ops=[],reset=false){
 const s=shoppingSettings(reset?{}:input);
 const states={servings:s.servings,selected:new Map(s.selected.map(name=>[normalize(name),name])),
  manual:new Map(s.manual.map(x=>[x.id,x])),
  checked:new Map(Object.entries(s.checked)),excluded:new Map(Object.entries(s.excluded))};
 for(const op of ops){
  const k=op.key,v=op.value;
  if(k==='servings'){
   if(Number.isInteger(v)&&v>=1&&v<=30)states.servings=v;
   continue;
  }
  if(k.startsWith('selected:')){
   const name=k.slice(9);
   if(v===null)states.selected.delete(name);
   else if(typeof v==='string'&&v.trim().length<=100&&normalize(v)===name)states.selected.set(name,v);
  }else if(k.startsWith('manual:')){
   const id=k.slice(7);
   if(v===null)states.manual.delete(id);
   else if(v?.id===id)states.manual.set(id,v);
  }else if(k.startsWith('checked:')){
   const id=k.slice(8);
   if(v===null)states.checked.delete(id);
   else if(typeof v==='string')states.checked.set(id,v);
  }else if(k.startsWith('excluded:')){
   const id=k.slice(9);
   if(v===null||v===false)states.excluded.delete(id);
   else if(v===true)states.excluded.set(id,true);
  }
 }
 return shoppingSettings({servings:states.servings,selected:[...states.selected.values()],
  manual:[...states.manual.values()],checked:Object.fromEntries(states.checked),
  excluded:Object.fromEntries(states.excluded)});
}
export function applyMasterEvents(scope,ops,allowedCategories=['main']){
 if(!scope.aliases)scope.aliases={};
 if(!scope.metadata)scope.metadata={};
 if(!Array.isArray(scope.manual))scope.manual=[];
 const allowed=new Set(allowedCategories);
 for(const op of ops){
  if(!op.key.startsWith('dish:'))continue;
  const key=op.key.slice(5);
  if(op.value===null){
   scope.manual=scope.manual.filter(d=>normalize(d.name)!==key);
   delete scope.metadata[key];
   continue;
  }
  const d=op.value;
  if(!d||typeof d.name!=='string'||normalize(d.name)!==key||
     !allowed.has(d.category)||d.name.length>100)continue;
  let ingredients;try{ingredients=validateIngredients(d.ingredients||[]);}catch{continue;}
  const safe={name:d.name,category:d.category,protein:d.protein||'不明',
   method:d.method||'不明',genre:d.genre||'不明'};
  const index=scope.manual.findIndex(x=>normalize(x.name)===key);
  if(index>=0)scope.manual[index]=safe;else scope.manual.push(safe);
  scope.metadata[key]={...(scope.metadata[key]||{}),...safe,ingredients};
 }
}

/**
 * Only the visible menu draft is shared. Calendar history, local suggestion
 * scores and the recipe catalogue stay on the original device.
 * Each day is a separate Sheets journal key so edits to different days merge.
 */
function safePlanDay(value,index,categories=[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.dishes)||
  value.dishes.length>30)throw Error('共有献立の日付データが不正です。');
 const id=typeof value.id==='string'&&value.id.length<=100?value.id:'day-'+index;
 const dishes=value.dishes.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('共有献立の料理情報が不正です。');
  if(typeof item.category!=='string'||!/^[a-z][a-z0-9-]*$/.test(item.category))throw Error('共有献立の料理分類が不正です。');
  const dish=validateDishes([item])[0];
  for(const field of ['protein','method','genre'])if(dish[field].length>100)throw Error('共有献立の料理情報が長すぎます。');
  const categoryName=String(item.categoryName||categories.find(c=>c.id===dish.category)?.name||dish.category);
  if(!categoryName||categoryName.length>20)throw Error('共有献立の分類名が不正です。');
  return {...dish,categoryName,locked:item.locked===true,isNew:item.isNew===true};
 });
 return {id,dishes};
}
export function planSharedSnapshot(draft=[],categories=[]){
 if(!Array.isArray(draft)||draft.length>MAX_GENERATION_DAYS)throw Error('共有できる献立は最大15日分です。');
 const snapshot={length:draft.length};
 for(const [index,day] of draft.entries())snapshot['day:'+index]=safePlanDay(day,index,categories);
 return snapshot;
}
export function applyPlanEvents(current=[],ops=[],reset=false){
 const initial=planSharedSnapshot(reset?[]:current);
 const changed={...initial};
 for(const op of ops){
  const key=op?.key;
  if(key==='length'){
   if(!Number.isInteger(op.value)||op.value<0||op.value>MAX_GENERATION_DAYS)
    throw Error('共有献立の日数が不正です。');
   changed.length=op.value;
  }else if(/^day:(?:[0-9]|1[0-4])$/.test(key||'')){
   if(op.value===null)delete changed[key];
   else changed[key]=safePlanDay(op.value,Number(key.slice(4)));
  }else throw Error('共有献立の項目が不正です。');
 }
 return Array.from({length:changed.length},(_,index)=>changed['day:'+index]||
  {id:'day-'+index,dishes:[]});
}
