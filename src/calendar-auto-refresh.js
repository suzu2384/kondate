// A small policy module keeps timer, resume and reconnect behavior consistent.
export const CALENDAR_REFRESH_MINUTES=Object.freeze([0,1,3,5,10,15,30,60]);
export const DEFAULT_CALENDAR_REFRESH_MINUTES=5;
export function normalizeCalendarRefreshMinutes(value){
 return CALENDAR_REFRESH_MINUTES.includes(value)?value:DEFAULT_CALENDAR_REFRESH_MINUTES;
}
export function isCalendarRefreshDue({
 minutes,lastSyncAt=0,lastAttemptAt=0,now,connected=false,online=false,visible=false,busy=false,configured=false
}){
 const interval=normalizeCalendarRefreshMinutes(minutes);
 if(interval===0||!connected||!online||!visible||busy||!configured)return false;
 if(lastSyncAt&&now-lastSyncAt<interval*60000)return false;
 // A failed request must not turn a resume/focus event into a request storm.
 const retryDelay=Math.min(interval*60000,5*60000);
 if(lastAttemptAt&&now-lastAttemptAt<retryDelay)return false;
 return true;
}

/**
 * Google can return an unchanged or missing etag for some externally modified
 * calendar events. Compare the actual event payload so cross-device edits to
 * titles, dates, descriptions, and metadata still repaint the month grid.
 */
export function calendarEventsChanged(previous=[],incoming=[]){
 if(previous.length!==incoming.length)return true;
 return incoming.some((event,index)=>
  JSON.stringify(event)!==JSON.stringify(previous[index])
 );
}

/**
 * Read each calendar independently. An inaccessible secondary calendar must
 * not prevent the other selected calendars from updating.
 */
export async function fetchCalendarUpdates(ids,fetchEvents){
 const outcomes=await Promise.allSettled(ids.map(id=>fetchEvents(id)));
 const received=[],failed=[];
 outcomes.forEach((result,index)=>{
  const calendarId=ids[index];
  if(result.status==='fulfilled')received.push({calendarId,events:result.value});
  else failed.push({calendarId,error:result.reason});
 });
 return {received,failed};
}
