import {normalize,resolveName} from './model.js';

/** A generated menu exists only if it contains at least one named dish. */
export function hasPlannedDishes(draft){
 return Array.isArray(draft)&&draft.some(day=>Array.isArray(day?.dishes)&&day.dishes.some(dish=>String(dish?.name??'').trim()));
}

export function initialMasterFilter(draft){
 return hasPlannedDishes(draft)?'plan':'all';
}

/**
 * Master order comes from buildMaster (newest cooking date first).
 * The generated menu intentionally keeps day and dish order, including repeats.
 * Synthetic entries for unregistered dishes can be searched but not edited.
 */
export function masterFilterItems(items,draft,selection='all',aliases={},selectedShopping=[]){
 const list=Array.isArray(items)?items:[];
 if(selection==='all')return list;
 if(selection==='shopping'){
  const byKey=new Map(list.map(d=>[d.key||normalize(d.name),d]));
  return (Array.isArray(selectedShopping)?selectedShopping:[]).flatMap(name=>{
   const displayName=String(name||'').trim();
   if(!displayName)return [];
   const existing=byKey.get(normalize(resolveName(displayName,aliases)));
   return [existing||{name:displayName,category:'main',key:'',count:0,lastDate:null,unregistered:true}];
  });
 }
 if(selection==='plan'){
  if(!hasPlannedDishes(draft))return [];
  const byKey=new Map(list.map(d=>[d.key||normalize(d.name),d]));
  return draft.flatMap(day=>Array.isArray(day?.dishes)?day.dishes:[]).flatMap(dish=>{
   const name=String(dish?.name??'').trim();
   if(!name)return [];
   const existing=byKey.get(normalize(resolveName(name,aliases)));
   return [existing||{name,category:dish.category||'main',key:'',count:0,lastDate:null,unregistered:true}];
  });
 }
 if(selection.startsWith('category:')){
  const category=selection.slice('category:'.length);
  return list.filter(d=>d.category===category);
 }
 return list;
}
