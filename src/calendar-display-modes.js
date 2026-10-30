/** Three-way calendar visibility with legacy selected-calendar compatibility. */
export const CALENDAR_DISPLAY_OPTIONS=Object.freeze(['visible','detail','hidden']);
export const MAX_CALENDAR_DISPLAY_ENTRIES=200;
const safeId=id=>typeof id==='string'&&id.length>0&&id.length<=512&&
 !['__proto__','constructor','prototype'].includes(id);
const safeMode=mode=>CALENDAR_DISPLAY_OPTIONS.includes(mode);
export function validateCalendarDisplayModes(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).length>MAX_CALENDAR_DISPLAY_ENTRIES)
  throw Error('カレンダーの表示方法の設定が不正です。');
 for(const [id,mode] of Object.entries(value))
  if(!safeId(id)||!safeMode(mode))throw Error('カレンダーの表示方法の設定が不正です。');
}
export function normalizeCalendarDisplayModes(value){
 const result={};
 if(!value||typeof value!=='object'||Array.isArray(value))return result;
 for(const [id,mode] of Object.entries(value).slice(0,MAX_CALENDAR_DISPLAY_ENTRIES))
  if(safeId(id)&&safeMode(mode))result[id]=mode;
 return result;
}
export function calendarDisplayMode(id,modes={},assignedIds=[],legacyExtraIds=[]){
 if(modes&&Object.hasOwn(modes,id)&&safeMode(modes[id]))return modes[id];
 return assignedIds.includes(id)||legacyExtraIds.includes(id)?'visible':'hidden';
}
export function filterCalendarEntries(entries,modes={},assignedIds=[],legacyExtraIds=[],target='cell'){
 return entries.filter(event=>{
  const mode=calendarDisplayMode(event.calendarId,modes,assignedIds,legacyExtraIds);
  return target==='detail'?mode!=='hidden':mode==='visible';
 });
}
