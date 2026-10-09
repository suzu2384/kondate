import {addDays} from './model.js';
import {matchesPreset,matchingPresetEvent,presetEventPayload} from './icon-presets.js';

export const PRESET_QUEUE_STORAGE_KEY='kondate.preset-write-queue.v1';
export const PRESET_FLUSH_INTERVAL_MS=5000;

// Keep a durable journal of the user's desired final state, rather than each tap.
// A pending change can be toggled off without touching Google Calendar.
export class PresetWriteQueue {
 constructor(storage,makeId=()=>crypto.randomUUID().replaceAll('-','').slice(0,32),key=PRESET_QUEUE_STORAGE_KEY){
  this.storage=storage;this.makeId=makeId;this.storageKey=key;
  this.entries=new Map();this.inflight=new Set();
  try{
   const raw=storage?.getItem(key);
   if(raw&&raw.length<250000){
    const stored=JSON.parse(raw);
    if(Array.isArray(stored))for(const entry of stored.slice(0,500)){
     const rule=entry?.rule;
     if(!rule||typeof rule.id!=='string'||typeof rule.keyword!=='string'||typeof rule.calendarId!=='string'||typeof rule.memo!=='string'||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||typeof entry.present!=='boolean'||typeof entry.id!=='string'||!/^[0-9a-f]{10,64}$/.test(entry.id)||
        rule.keyword.length>80||rule.memo.length>2000||rule.calendarId.length>512)continue;
     this.entries.set(this.keyFor(rule,entry.date),{date:entry.date,rule:{...rule},present:entry.present,id:entry.id,version:1});
    }
   }
  }catch{ /* damaged local journal is ignored rather than breaking app startup */ }
 }
 get size(){return this.entries.size;}
 keyFor(rule,date){return JSON.stringify([rule.calendarId,date,String(rule.keyword).trim(),String(rule.memo||'')]);}
 list(){return [...this.entries.entries()].map(([key,value])=>({key,...value,rule:{...value.rule}}));}
 get(key){return this.entries.get(key);}
 save(){
  try{
   if(this.entries.size) this.storage?.setItem(this.storageKey,JSON.stringify(this.list().map(({key,...value})=>value)));
   else this.storage?.removeItem(this.storageKey);
  }catch{throw Error('未同期の予定を端末に保存できませんでした。端末の保存容量・プライベートブラウズ設定を確認してください。');}
 }
 toggle(rule,date,serverEvents=[]){
  presetEventPayload(date,rule);
  const snapshot={id:String(rule.id),keyword:String(rule.keyword).trim(),memo:String(rule.memo||''),calendarId:String(rule.calendarId),icon:String(rule.icon||''),color:String(rule.color||'')};
  const key=this.keyFor(snapshot,date);
  const remote=!!matchingPresetEvent(serverEvents,snapshot.calendarId,date,snapshot);
  const visible=!!matchingPresetEvent(this.project(snapshot.calendarId,serverEvents),snapshot.calendarId,date,snapshot);
  const present=!visible,previous=this.entries.get(key);
  if(present===remote&&!this.inflight.has(key))this.entries.delete(key);
  else{
   if(!previous&&this.entries.size>=500)throw Error('未同期の予定が多すぎます。先に保存してください。');
   this.entries.set(key,{rule:snapshot,date,present,id:previous?.id||this.makeId(),version:(previous?.version||0)+1});
  }
  this.save();
  return {present,count:this.size};
 }
 project(calendarId,events=[]){
  let result=events.slice();
  for(const entry of this.entries.values()){
   if(entry.rule.calendarId!==calendarId)continue;
   const matches=e=>!e.recurringEventId&&e.start?.date===entry.date&&matchesPreset(e,calendarId,entry.rule);
   const found=result.some(matches);
   if(!entry.present)result=result.filter(e=>!matches(e));
   else if(!found)result.push({...presetEventPayload(entry.date,entry.rule),id:entry.id,_presetPending:true});
  }
  return result;
 }
 markInflight(keys){for(const key of keys)this.inflight.add(key);}
 unmarkInflight(keys){for(const key of keys)this.inflight.delete(key);}
 ack(key,version){
  if(this.entries.get(key)?.version!==version)return false;
  this.entries.delete(key);this.save();return true;
 }
}
