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
