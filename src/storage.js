const KEY='kondate.v1';

// Meal events are transient API results. Save settings and generated menus only.
// Never persist history, local approvals, or unfinished record entries.
export function storedState(state){
 const {recordDraft,...settingsOnly}=state||{};
 const scopes={};
 for(const [key,scope] of Object.entries(state?.scopes||{})){
  if(!scope||typeof scope!=='object')continue;
  const {events,legacy,lastSync,...settings}=scope;
  scopes[key]={...settings,events:[],legacy:{},lastSync:null};
 }
 return {...settingsOnly,scopes};
}
export function readState(){
 try{return storedState(JSON.parse(localStorage.getItem(KEY)||'{}'));}
 catch{return {};}
}
export function saveState(state){
 try{localStorage.setItem(KEY,JSON.stringify(storedState(state)));return true;}
 catch{window.dispatchEvent(new CustomEvent('storage-failed'));return false;}
}
export function calendarKey(clientId,calendarId){return `${clientId}|${calendarId}`;}
