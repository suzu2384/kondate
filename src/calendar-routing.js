import {validateDishes} from './model.js';

/** All meal-calendar assignments are explicit; there is no default calendar. */
export function calendarForCategory(category,_unusedDefaultCalendarId,assignments={}){
 return assignments?.[category] || '';
}
export function activeCalendarIds(_unusedDefaultCalendarId,categories,assignments={}){
 return [...new Set(categories.map(c=>calendarForCategory(c.id,'',assignments)).filter(Boolean))];
}
/** Move the old standard calendar to Main without overwriting explicit assignments. */
export function migrateCategoryCalendars(categories,assignments={},legacyDefaultCalendarId=''){
 const migrated={...assignments};
 if(legacyDefaultCalendarId&&categories.some(c=>c.id==='main')&&!migrated.main)migrated.main=legacyDefaultCalendarId;
 return migrated;
}
/** Stable event IDs allow safe retries if one of several calendar writes fails. */
export function splitRecordByCalendar(record,defaultCalendarId,assignments={}){
 const groups=new Map();
 for(const dish of validateDishes(record.dishes)){
  const calendarId=calendarForCategory(dish.category,defaultCalendarId,assignments);
  if(!calendarId)throw Error('分類「'+dish.category+'」の保存先カレンダーが未設定です。設定画面で指定してください。');
  if(!groups.has(calendarId))groups.set(calendarId,[]);
  groups.get(calendarId).push(dish);
 }
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([calendarId,dishes],i)=>({
  calendarId,
  record:{...record,id:i===0?record.id:record.id+i.toString(16).padStart(2,'0'),dishes}
 }));
}
