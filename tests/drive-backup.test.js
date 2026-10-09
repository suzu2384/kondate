import test from 'node:test';
import assert from 'node:assert/strict';
import {createDriveSnapshot,readDriveSnapshot,restoreDriveSnapshot} from '../src/drive-backup.js';

function state(){
 return {
  timeZone:'Asia/Tokyo',from:'2024-01-01',categories:[{id:'main',name:'主菜'}],
  rules:{days:7,counts:{main:1}},theme:{color:'green',mode:'auto'},
  seedEnabled:true,categoryCalendars:{main:'family@example.com'},
  extraCalendarIds:[],iconRules:[],calendarRefreshMinutes:15,draft:[{dishes:[{name:'カレー',category:'main'}]}],
  scopes:{'client|family@example.com':{
   events:[{id:'actual-meal',summary:'personal history'}],
   legacy:{event:{accepted:true}},lastSync:123456,
   aliases:{'めん':'麺'},metadata:{'カレー':{category:'main',method:'煮る'}},
   manual:[{name:'自家製スープ',category:'main'}]
  }},
  clientId:'browser-only',token:'never-send'
 };
}
test('backup contains settings, draft and user master edits but no calendar events or credentials',()=>{
 const original=state();
 const snapshot=createDriveSnapshot(original);
 const encoded=JSON.stringify(snapshot);
 assert.equal(snapshot.format,'kondate-drive-settings-v2');
 assert.deepEqual(snapshot.settings.categoryCalendars,{main:'family@example.com'});
 assert.equal(snapshot.settings.calendarRefreshMinutes,15);
 assert.equal(snapshot.settings.draft[0].dishes[0].name,'カレー');
 assert.equal(snapshot.master['client|family@example.com'].manual[0].name,'自家製スープ');
 for(const forbidden of ['actual-meal','personal history','accepted','lastSync','never-send','browser-only','clientId'])
  assert.equal(encoded.includes(forbidden),false,forbidden+' should not be uploaded');
});
test('valid backup restores safely, clears cached events and leaves local account data intact',()=>{
 const old=state();
 const snapshot=createDriveSnapshot(old);
 const onNewDevice=state();
 onNewDevice.theme.color='blue';
 onNewDevice.draft=[];
 onNewDevice.scopes['client|family@example.com'].events=[{id:'locally-fetched'}];
 let checked=false;
 const preview=readDriveSnapshot(snapshot,onNewDevice,input=>{
  checked=true;
  assert.equal(input.format,'kondate-settings-v1');
  assert.equal(input.state.categories[0].id,'main');
 });
 assert.equal(checked,true);
 restoreDriveSnapshot(onNewDevice,preview);
 assert.equal(onNewDevice.theme.color,'green');
 assert.equal(onNewDevice.calendarRefreshMinutes,15);
 assert.equal(onNewDevice.draft[0].dishes[0].name,'カレー');
 assert.equal(onNewDevice.scopes['client|family@example.com'].manual[0].name,'自家製スープ');
 assert.deepEqual(onNewDevice.scopes['client|family@example.com'].events,[]);
 assert.equal(onNewDevice.scopes['client|family@example.com'].lastSync,null);
 assert.equal(onNewDevice.token,'never-send');
});
test('old Drive snapshots still restore their saved settings without touching existing draft',()=>{
 const local=state();
 const originalDraft=structuredClone(local.draft);
 const legacy={format:'kondate-drive-settings-v1',updatedAt:'2026-10-08T00:00:00Z',settings:{theme:{color:'yellow',mode:'dark'}}};
 const preview=readDriveSnapshot(legacy,local,()=>{});
 restoreDriveSnapshot(local,preview);
 assert.equal(local.theme.color,'yellow');
 assert.deepEqual(local.draft,originalDraft);
});
test('invalid or oversized Drive backups are rejected before changing local preferences',()=>{
 const local=state();
 for(const backup of [
  {format:'unexpected',settings:{}},
  {format:'kondate-drive-settings-v2',settings:{},master:{'bad':{manual:'not-array',aliases:{},metadata:{}}}},
  JSON.parse('{"format":"kondate-drive-settings-v1","settings":{"__proto__":{"theme":"bad"}}}')
 ])assert.throws(()=>readDriveSnapshot(backup,local,()=>{}));
 assert.equal(local.theme.color,'green');
});
