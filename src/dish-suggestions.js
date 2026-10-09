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
