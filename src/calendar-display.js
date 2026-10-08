/**
 * Display-only events from calendars not assigned to meal history.
 * Original Google Calendar titles are never changed by icon mappings.
 */
export function eventDay(event,timeZone='Asia/Tokyo'){
 if(event.status==='cancelled')return null;
 const raw=event.start?.date;
 if(raw&&/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
 if(!event.start?.dateTime)return null;
 try{
  return new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.start.dateTime));
 }catch{return null;}
}
export function matchIcon(title,rules=[]){
 const haystack=String(title||'').normalize('NFKC').toLocaleLowerCase('ja');
 for(const rule of rules){
  const needle=String(rule.keyword||'').normalize('NFKC').trim().toLocaleLowerCase('ja');
  if(needle&&haystack.includes(needle)&&typeof rule.icon==='string')return rule.icon;
 }
 return '';
}
export const ICON_CHOICES=['📌','🗑️','♻️','🏫','🏥','🎂','💼','🏃','🛍️','🎉','🚗','🚃','✈️','💊','🍽️','⭐'];
