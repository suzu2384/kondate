const KEY='kondate.v1';
export function readState(){try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}}
export function saveState(state){try{localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{window.dispatchEvent(new CustomEvent('storage-failed'));return false;}}
export function calendarKey(clientId,calendarId){return `${clientId}|${calendarId}`;}
