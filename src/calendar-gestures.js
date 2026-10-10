// Shared touch/navigation rules for the Google Calendar month view.
// A highlighted date already has focus. Open immediately when it is tapped.
// An unselected date is highlighted first, without opening the editor.
export function dateTapAction(selected,date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return {selected,open:false};
 return {selected:date,open:selected===date};
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
// A proportional distance threshold, bounded for both narrow phones and wide tablets.
export function monthSnapOffset(dx,width){
 if(!Number.isFinite(dx)||!Number.isFinite(width)||width<=0)return 0;
 const threshold=Math.min(120,Math.max(55,width*0.22));
 return Math.abs(dx)>=threshold?(dx<0?1:-1):0;
}
export function moveMonth(date,offset){
 return new Date(date.getFullYear(),date.getMonth()+offset,1,12);
}
