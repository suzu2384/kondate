import {addDays} from './model.js';
import {normalizeIcon,normalizeIconColor} from './calendar-display.js';
export function presetCalendarIds(rules=[]){
 return [...new Set(rules.filter(r=>String(r.keyword||'').trim()&&r.calendarId).map(r=>r.calendarId))];
}
const titleOf=rule=>String(rule.keyword||'').trim();
const memoOf=rule=>String(rule.memo||'');
export function matchesPreset(event,calendarId,rule){
 return !!rule&&rule.calendarId===calendarId&&titleOf(rule)!==''&&
  event.summary===titleOf(rule)&&String(event.description||'')===memoOf(rule);
}
export function isPresetEvent(event,calendarId,rules=[]){
 if(event?.extendedProperties?.private?.kondatePreset==='1')return true;
 return rules.some(rule=>matchesPreset(event,calendarId,rule));
}
// Resolve one preset consistently for the icon, its color, and display order.
// Read-only/shared events often have no KonDate preset ID.
export function matchingDisplayPreset(event,calendarId,rules=[]){
 const presetId=event?.extendedProperties?.private?.kondatePresetId||event?.presetId;
 const byId=presetId&&rules.find(rule=>rule.id===presetId);
 if(byId)return byId;
 const exact=rules.find(rule=>matchesPreset(event,calendarId,rule));
 if(exact)return exact;
 const title=String(event?.summary??event?.title??'').normalize('NFKC').toLocaleLowerCase('ja');
 return rules.find(rule=>{
  const keyword=String(rule.keyword||'').normalize('NFKC').trim().toLocaleLowerCase('ja');
  return keyword&&title.includes(keyword)&&typeof rule.icon==='string';
 })||null;
}
export function presetIcon(event,calendarId,rules=[]){
 const matched=matchingDisplayPreset(event,calendarId,rules);
 return matched?.icon?normalizeIcon(matched.icon):'';
}
export function presetColor(event,calendarId,rules=[]){
 return normalizeIconColor(matchingDisplayPreset(event,calendarId,rules)?.color);
}
export function matchingPresetEvent(events,calendarId,date,rule){
 return events.find(e=>e.status!=='cancelled'&&!e.recurringEventId&&
  e.start?.date===date&&matchesPreset(e,calendarId,rule));
}
export function presetEventPayload(date,rule){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw Error('日付の形式が不正です。');
 if(!titleOf(rule)||titleOf(rule).length>80||memoOf(rule).length>2000||!rule.calendarId)
  throw Error('プリセットのタイトル・メモ・登録先カレンダーを確認してください。');
 return {summary:titleOf(rule),description:memoOf(rule),
  start:{date},end:{date:addDays(date,1)},transparency:'transparent',
  extendedProperties:{private:{kondatePreset:'1',kondatePresetId:String(rule.id)}}};
}
