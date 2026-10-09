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
