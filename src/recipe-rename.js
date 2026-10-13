import {eventRecord,normalize,resolveName} from './model.js';

const MEAL_PREFIX=/^((?:【|\[)?(?:献立|晩御飯|晩ご飯|夕食|夕飯|昼食|朝食)(?:】|\])?\s*[:：\s]?)/;

/**
 * Rename exact dish tokens only. Never perform substring replacements:
 * 「サバの味噌煮」 must not rewrite unrelated calendar notes or titles.
 */
function renameTokens(value,aliases,targetKeys,{mealPrefix=false}={}){
 const pieces=String(value||'').split(/([、,\n／\/])/);
 return pieces.map((part,index)=>{
  if(index%2)return part;
  const leading=part.match(/^\s*/)?.[0]||'';
  const trailing=part.match(/\s*$/)?.[0]||'';
  let body=part.slice(leading.length,part.length-trailing.length);
  let prefix='';
  if(mealPrefix){
   const meal=body.match(MEAL_PREFIX);
   if(meal){prefix=meal[0];body=body.slice(prefix.length);}
  }
  const marker=body.match(/^[・-]\s*/)?.[0]||'';
  body=body.slice(marker.length);
  const canonical=resolveName(body,aliases);
  if(!targetKeys.has(normalize(canonical))||body===canonical)return part;
  return leading+prefix+marker+canonical+trailing;
 }).join('');
}

function renameLegacyDescription(value,aliases,targetKeys,categories){
 return String(value||'').split('\n').map(line=>{
  const leading=line.match(/^\s*/)?.[0]||'';
  const text=line.slice(leading.length);
  const category=categories.find(c=>text.startsWith(c.name+'：')||text.startsWith(c.name+':'));
  if(!category)return line; // Unstructured notes must stay untouched.
  const prefix=text.slice(0,category.name.length+1);
  return leading+prefix+renameTokens(text.slice(prefix.length),aliases,targetKeys);
 }).join('\n');
}

/**
 * Build a minimal Calendar update for the renamed master entries.
 * Owned entries update the structured dishes. Legacy events keep their original
 * description, dates, times and other properties; only dish tokens are patched.
 * Returns null when the event is unrelated or already current.
 */
export function calendarDishRename(event,aliases,targets,categories,timeZone='Asia/Tokyo'){
 const keys=new Set((targets||[]).map(name=>normalize(resolveName(name,aliases))).filter(Boolean));
 if(!keys.size)return null;
 const record=eventRecord(event,{},categories,timeZone);
 if(!record||record.status!=='actual')return null;
 let changed=false;
 const dishes=record.dishes.map(dish=>{
  const name=resolveName(dish.name,aliases);
  if(!keys.has(normalize(name))||name===dish.name)return dish;
  changed=true;
  return {...dish,name};
 });
 if(!changed)return null;
 if(record.owned)return {kind:'owned',record:{...record,dishes}};
 const summary=renameTokens(event.summary,aliases,keys,{mealPrefix:true});
 const description=renameLegacyDescription(event.description,aliases,keys,categories);
 const patch={};
 if(summary!==String(event.summary||''))patch.summary=summary;
 if(description!==String(event.description||''))patch.description=description;
 // A previously imported legacy event might have an unusual format. Do not
 // silently claim completion if we could not safely rewrite its dish token.
 return Object.keys(patch).length?{kind:'legacy',patch}:{kind:'unsupported'};
}
