const KEY='kondate.v1';

// Meal events are transient API results. Keep only settings and unfinished work
// across reloads, never duplicate calendar records or local import decisions.
export function storedState(state){
 const scopes={};
 for(const [key,scope] of Object.entries(state?.scopes||{})){
  if(!scope||typeof scope!=='object')continue;
  const {events,legacy,lastSync,...settings}=scope;
  scopes[key]={...settings,events:[],legacy:{},lastSync:null};
 }
 return {...state,scopes};
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
