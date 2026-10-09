// Shared touch/navigation rules for the Google Calendar month view.
// The initial highlighted date does not count as a previous user tap.
export function dateTapAction(selected,lastTapped,date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return {selected,lastTapped,open:false};
 const open=selected===date&&lastTapped===date;
 return {selected:date,lastTapped:open?'':date,open};
}
export function horizontalMonthSwipe(start,end){
 if(!start||!end)return 0;
 const elapsed=end.time-start.time;
 const dx=end.x-start.x,dy=end.y-start.y;
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||elapsed<0||elapsed>1400)return 0;
 // Intentional horizontal swipes only: ignore taps and vertical scrolls.
 if(Math.abs(dx)<55||Math.abs(dx)<=Math.abs(dy)*1.4)return 0;
 return dx<0?1:-1;
}
export function moveMonth(date,offset){
 return new Date(date.getFullYear(),date.getMonth()+offset,1,12);
}
