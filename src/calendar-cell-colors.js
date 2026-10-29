/** User-defined calendar date cell tints. Only displayed calendars may contribute. */
export const DEFAULT_CALENDAR_CELL_COLORS=Object.freeze({saturday:'',sunday:'',calendars:{}});
export const MAX_CALENDAR_COLOR_ENTRIES=100;
const safeHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const cleanColor=value=>safeHex(value)?value.toLowerCase():'';
const safeId=id=>typeof id==='string'&&id.length>0&&id.length<=512&&
 !['__proto__','constructor','prototype'].includes(id);

export function validateCalendarCellColors(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('カレンダーのマス色の設定が不正です。');
 for(const name of ['saturday','sunday'])
  if(value[name]!==undefined&&value[name]!==''&&!safeHex(value[name]))throw Error('土日のマス色が不正です。');
 const calendars=value.calendars;
 if(calendars!==undefined){
  if(!calendars||typeof calendars!=='object'||Array.isArray(calendars)||
     Object.keys(calendars).length>MAX_CALENDAR_COLOR_ENTRIES)throw Error('カレンダー別のマス色が不正です。');
  for(const [id,color] of Object.entries(calendars))
   if(!safeId(id)||!safeHex(color))throw Error('カレンダー別のマス色が不正です。');
 }
}
export function normalizeCalendarCellColors(value){
 const result={saturday:'',sunday:'',calendars:{}};
 if(!value||typeof value!=='object'||Array.isArray(value))return result;
 result.saturday=cleanColor(value.saturday);
 result.sunday=cleanColor(value.sunday);
 const entries=value.calendars;
 if(entries&&typeof entries==='object'&&!Array.isArray(entries)){
  for(const [id,color] of Object.entries(entries).slice(0,MAX_CALENDAR_COLOR_ENTRIES))
   if(safeId(id)&&safeHex(color))result.calendars[id]=cleanColor(color);
 }
 return result;
}
function tint(hex){
 // Keep foreground contrast in light and dark themes.
 return 'color-mix(in srgb, '+hex+' 35%, var(--surface))';
}
/** Return a safe CSS background expression, or '' for ordinary cells. */
export function calendarCellBackground(date,records=[],extras=[],config={},visibleCalendarIds=[]){
 const prefs=normalizeCalendarCellColors(config);
 const visible=new Set(visibleCalendarIds);
 const present=new Set([...records,...extras]
  .filter(e=>e?.date===date&&visible.has(e.calendarId)).map(e=>e.calendarId));
 const assigned=visibleCalendarIds.filter(id=>present.has(id)&&prefs.calendars[id])
  .filter((id,i,list)=>list.indexOf(id)===i)
  .map(id=>prefs.calendars[id]);
 if(assigned.length===1)return tint(assigned[0]);
 if(assigned.length>1){
  // Equal-width bands for simultaneous calendar colors on the same date.
  const stops=assigned.flatMap((color,i)=>{
   const from=(100*i/assigned.length).toFixed(4)+'%';
   const to=(100*(i+1)/assigned.length).toFixed(4)+'%';
   return [tint(color)+' '+from,tint(color)+' '+to];
  });
  return 'linear-gradient(90deg, '+stops.join(', ')+')';
 }
 const day=new Date(date+'T12:00:00').getDay();
 const weekend=day===0?prefs.sunday:day===6?prefs.saturday:'';
 return weekend?tint(weekend):'';
}
