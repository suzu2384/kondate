import {normalize} from './model.js';
// Rank existing dishes consistently across mobile and desktop.
// Empty query shows the most recent dishes, category first.
export function dishSuggestions(items,query='',category='',limit=8){
 const term=normalize(query);
 return items
  .filter(d=>d&&typeof d.name==='string'&&(!term||normalize(d.name).includes(term)))
  .map((dish,index)=>{
   const key=normalize(dish.name);
   const similarity=!term?0:key===term?3:key.startsWith(term)?2:1;
   const sameCategory=dish.category===category?1:0;
   return {dish,index,similarity,sameCategory};
  })
  .sort((a,b)=>b.similarity-a.similarity||b.sameCategory-a.sameCategory||a.index-b.index)
  .slice(0,limit)
  .map(entry=>entry.dish);
}


/**
 * Prioritize the currently generated menu when the search box is empty.
 * Enrich planned dishes from the master when available, without excluding
 * newly generated meals that are not registered yet.
 */
export function recordDishSuggestions(masterItems,planDays=[],query='',category='',limit=48){
 const known=Array.isArray(masterItems)?masterItems.filter(d=>d&&typeof d.name==='string'):[];
 const plan=Array.isArray(planDays)?planDays.flatMap(day=>Array.isArray(day?.dishes)?day.dishes:[]):[];
 const key=d=>normalize(d.name)+'|'+String(d.category||'');
 const lookup=new Map(known.map(d=>[key(d),d]));
 const planned=plan.filter(d=>d&&typeof d.name==='string'&&normalize(d.name))
  .map(d=>lookup.get(key(d))||d);
 const chosen=[],seen=new Set();
 const append=source=>{
  for(const d of dishSuggestions(source,query,category,limit)){
   const id=key(d);
   if(seen.has(id))continue;
   seen.add(id);chosen.push(d);
   if(chosen.length>=limit)break;
  }
 };
 append(planned);
 if(chosen.length<limit)append(known);
 return chosen;
}

/** Apply a picked master dish to the record editor; do not rebuild the dialog. */
export function selectRecordDish(editor,index,dish){
 if(!editor||!Array.isArray(editor.dishes)||!Number.isInteger(index)||index<0||
    index>=editor.dishes.length||!dish||typeof dish.name!=='string')return false;
 editor.dishes[index]={
  name:dish.name,
  category:dish.category,
  protein:dish.protein||'不明',
  method:dish.method||'不明',
  genre:dish.genre||'不明'
 };
 return true;
}
