import {validateDishes} from './model.js';
export const SETTINGS=['timeZone','from','categories','rules','theme','seedEnabled','categoryCalendars','extraCalendarIds','iconRules','calendarRefreshMinutes','draft'];
const FORMAT='kondate-drive-settings-v2';
const copy=x=>structuredClone(x);
export function createDriveSnapshot(state){
 const master={};
 for(const [key,s] of Object.entries(state.scopes||{})){
  if(!s)continue;
  const prefs={aliases:s.aliases||{},metadata:s.metadata||{},manual:s.manual||[]};
  if(Object.keys(prefs.aliases).length||Object.keys(prefs.metadata).length||prefs.manual.length)
   master[key]=copy(prefs);
 }
 return {format:FORMAT,updatedAt:new Date().toISOString(),
  settings:Object.fromEntries(SETTINGS.map(k=>[k,copy(state[k])])),
  master};
}
export function readDriveSnapshot(raw,state,validateImport){
 if(!raw||!['kondate-drive-settings-v1',FORMAT].includes(raw.format)||
    !raw.settings||typeof raw.settings!=='object'||Array.isArray(raw.settings))
  throw Error('献立ノートのバックアップではありません。');
 const json=JSON.stringify(raw);
 if(json.length>2000000||json.includes('"__proto__"'))
  throw Error('バックアップの形式・サイズが不正です。');
 const settings=Object.fromEntries(SETTINGS.filter(k=>Object.hasOwn(raw.settings,k)).map(k=>[k,copy(raw.settings[k])]));
 validateImport({format:'kondate-settings-v1',state:{...state,...settings}});
 const master={};
 if(raw.format===FORMAT){
  if(!raw.master||typeof raw.master!=='object'||Array.isArray(raw.master))
   throw Error('料理マスターのバックアップが不正です。');
  for(const [key,v] of Object.entries(raw.master)){
   if(!key||key.length>512||!v||typeof v!=='object'||
    !v.aliases||typeof v.aliases!=='object'||!v.metadata||typeof v.metadata!=='object'||!Array.isArray(v.manual))
    throw Error('料理マスターのデータが不正です。');
   if(v.manual.length>2000)throw Error('料理マスターの件数が多すぎます。');
   for(const dish of v.manual)validateDishes([dish]);
   master[key]=copy(v);
  }
 }
 return {settings,master,updatedAt:raw.updatedAt,version:raw.format};
}
export function restoreDriveSnapshot(state,snapshot){
 for(const key of SETTINGS)if(Object.hasOwn(snapshot.settings,key))state[key]=copy(snapshot.settings[key]);
 for(const [key,prefs] of Object.entries(snapshot.master)){
  state.scopes[key]={...(state.scopes[key]||{}),...copy(prefs)};
 }
 for(const bucket of Object.values(state.scopes||{})){bucket.events=[];bucket.lastSync=null;}
}
