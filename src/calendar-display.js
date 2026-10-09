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
  if(needle&&haystack.includes(needle)&&typeof rule.icon==='string')return normalizeIcon(rule.icon);
 }
 return '';
}
// SVG filenames supplied by the user. No icon meanings are assigned by this UI.
export const ICON_CHOICES=["pin","trash","recycle","school","hospital","cake","briefcase-business","sport-shoe","shopping-cart","party-popper","car","tram-front","plane","pill"];
export const LEGACY_ICONS={"📌":"pin","🗑️":"trash","♻️":"recycle","🏫":"school","🏥":"hospital","🎂":"cake","💼":"briefcase-business","🏃":"sport-shoe","🛍️":"shopping-cart","🎉":"party-popper","🚗":"car","🚃":"tram-front","✈️":"plane","💊":"pill","🍽️":"pin","⭐":"pin"};
export const ICON_DEFAULT_COLOR='#436e57';
export const isSupportedIcon=icon=>ICON_CHOICES.includes(icon)||Object.hasOwn(LEGACY_ICONS,icon);
export const normalizeIcon=icon=>ICON_CHOICES.includes(icon)?icon:(LEGACY_ICONS[icon]||'pin');
export const normalizeIconColor=color=>/^#[0-9a-fA-F]{6}$/.test(String(color||''))?color:ICON_DEFAULT_COLOR;
