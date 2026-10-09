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
// MingCute Core Filled icons. Group everyday symbols first, then decorative markers.
export const ICON_CHOICES=["home_2_fill","user_2_fill","briefcase_fill","shopping_cart_2_fill","car_fill","fork_knife_fill","t_shirt_fill","fitness_fill","music_fill","celebrate_fill","heart_fill","star_fill","sparkles_fill","sun_fill","moon_fill","snow_fill","drop_fill","leaf_3_fill","flash_fill","alarm_2_fill","flag_3_fill","tag_fill","currency_cny_fill","thumb_up_2_fill","cross_fill","triangle_fill","square_fill","diamond_fill","clubs_fill","spade_fill"];
export const LEGACY_ICONS={"📌":"pin","🗑️":"trash","♻️":"recycle","🏫":"school","🏥":"hospital","🎂":"cake","💼":"briefcase-business","🏃":"sport-shoe","🛍️":"shopping-cart","🎉":"party-popper","🚗":"car","🚃":"tram-front","✈️":"plane","💊":"pill","🍽️":"fork_knife_fill","⭐":"star_fill"};
export const PREVIOUS_SVG_ICONS={"pin":"flag_3_fill","trash":"tag_fill","recycle":"leaf_3_fill","school":"home_2_fill","hospital":"cross_fill","cake":"celebrate_fill","briefcase-business":"briefcase_fill","sport-shoe":"fitness_fill","shopping-cart":"shopping_cart_2_fill","party-popper":"celebrate_fill","car":"car_fill","tram-front":"car_fill","plane":"car_fill","pill":"cross_fill"};
export const ICON_DEFAULT_COLOR='#ffffff';
export const isSupportedIcon=icon=>ICON_CHOICES.includes(icon)||Object.hasOwn(LEGACY_ICONS,icon)||Object.hasOwn(PREVIOUS_SVG_ICONS,icon);
export function normalizeIcon(icon){
 const name=Object.hasOwn(LEGACY_ICONS,icon)?LEGACY_ICONS[icon]:icon;
 return ICON_CHOICES.includes(name)?name:(PREVIOUS_SVG_ICONS[name]||'tag_fill');
}
export const normalizeIconColor=color=>/^#[0-9a-fA-F]{6}$/.test(String(color||''))?color:ICON_DEFAULT_COLOR;
