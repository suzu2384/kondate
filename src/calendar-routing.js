import {validateDishes} from './model.js';

/** An empty assignment means use the default calendar for this category. */
export function calendarForCategory(category,defaultCalendarId,assignments={}){
 return assignments?.[category] || defaultCalendarId;
}
export function activeCalendarIds(defaultCalendarId,categories,assignments={}){
 return [...new Set([defaultCalendarId,...categories.map(c=>calendarForCategory(c.id,defaultCalendarId,assignments))].filter(Boolean))];
}
/** Stable event IDs allow safe retries if one of several calendar writes fails. */
export function splitRecordByCalendar(record,defaultCalendarId,assignments={}){
 const groups=new Map();
 for(const dish of validateDishes(record.dishes)){
  const calendarId=calendarForCategory(dish.category,defaultCalendarId,assignments);
  if(!calendarId)throw Error('実績の保存先カレンダーが未設定です。');
  if(!groups.has(calendarId))groups.set(calendarId,[]);
  groups.get(calendarId).push(dish);
 }
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([calendarId,dishes],i)=>({
  calendarId,
  record:{...record,id:i===0?record.id:record.id+i.toString(16).padStart(2,'0'),dishes}
 }));
}
