import {addDays} from './model.js';
import {matchIcon,normalizeIcon,normalizeIconColor} from './calendar-display.js';
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
export function presetIcon(event,calendarId,rules=[]){
 const presetId=event?.extendedProperties?.private?.kondatePresetId;
 const byId=presetId&&rules.find(r=>r.id===presetId);
 if(byId?.icon)return normalizeIcon(byId.icon);
 const exact=rules.find(rule=>matchesPreset(event,calendarId,rule));
 return exact?.icon?normalizeIcon(exact.icon):matchIcon(event?.summary,rules);
}
export function presetColor(event,calendarId,rules=[]){
 const presetId=event?.extendedProperties?.private?.kondatePresetId;
 const byId=presetId&&rules.find(r=>r.id===presetId);
 const matched=byId||rules.find(rule=>matchesPreset(event,calendarId,rule))||
  rules.find(rule=>rule.keyword&&String(event?.summary||'').normalize('NFKC').toLocaleLowerCase('ja').includes(String(rule.keyword).normalize('NFKC').trim().toLocaleLowerCase('ja')));
 return normalizeIconColor(matched?.color);
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
