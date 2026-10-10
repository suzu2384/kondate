import {matchesPreset} from './icon-presets.js';

// Order is defined solely by the saved preset array. Calendar events are not modified.
export function presetOrderIndex(event,rules=[]){
 const presetId=event.presetId||event.extendedProperties?.private?.kondatePresetId;
 if(presetId){
  const byId=rules.findIndex(rule=>rule.id===presetId);
  if(byId>=0)return byId;
 }
 return rules.findIndex(rule=>matchesPreset({
  summary:event.title??event.summary,
  description:event.memo??event.description
 },event.calendarId,rule));
}
export function sortCalendarExtras(extras=[],rules=[]){
 return extras.map((event,index)=>{
  const rank=presetOrderIndex(event,rules);
  return {event,index,rank:rank<0?rules.length:rank};
 }).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(item=>item.event);
}
// Preserve every rule exactly, including those without destination calendars.
export function reorderPresetRules(rules,orderedIds){
 if(!Array.isArray(rules)||!Array.isArray(orderedIds)||rules.length!==orderedIds.length)
  throw Error('プリセットの並び順が不正です。');
 const lookup=new Map(rules.map(rule=>[rule.id,rule]));
 if(lookup.size!==rules.length||new Set(orderedIds).size!==rules.length||orderedIds.some(id=>!lookup.has(id)))
  throw Error('プリセットの並び順が不正です。');
 return orderedIds.map(id=>lookup.get(id));
}
export function movePresetRule(rules,id,direction){
 const index=rules.findIndex(rule=>rule.id===id);
 const next=index+direction;
 if(index<0||![-1,1].includes(direction)||next<0||next>=rules.length)return rules;
 const moved=rules.slice();
 const [item]=moved.splice(index,1);
 moved.splice(next,0,item);
 return moved;
}
