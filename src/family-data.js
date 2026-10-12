import {normalize} from './model.js';
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
export function shoppingSharedSnapshot(input={}){
 const s=shoppingSettings(input),out={servings:s.servings};
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
