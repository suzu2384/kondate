import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveSettingsClient} from '../src/drive.js';
const reply=obj=>new Response(JSON.stringify(obj),{status:200,headers:{'Content-Type':'application/json'}});
function storage(map){return {getItem:key=>map.get(key)||null,setItem:(key,v)=>map.set(key,String(v)),removeItem:key=>map.delete(key)};}
test('Drive auto sync is independently opt-in on each device and restores a valid token',()=>{
 const old=globalThis.localStorage;
 const map=new Map();globalThis.localStorage=storage(map);
 try{
  const deviceA=new DriveSettingsClient();deviceA.clientId='test-id';deviceA.token='drive-access-token';deviceA.expires=Date.now()+150000;
  assert.equal(deviceA.autoEnabled,false);
  deviceA.enableAuto();
  assert.equal(deviceA.autoEnabled,true);
  const relaunched=new DriveSettingsClient();
  assert.equal(relaunched.restoreAuto('test-id'),true);
  assert.equal(relaunched.connected,true);
  assert.equal(relaunched.autoEnabled,true);
  const otherStorage=new Map();globalThis.localStorage=storage(otherStorage);
  assert.equal(new DriveSettingsClient().autoEnabled,false,'another device does not inherit opt-in');
  globalThis.localStorage=storage(map);
  relaunched.disableAuto();
  assert.equal(map.size,0);
 }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('expired Drive session is removed without switching auto sync off',()=>{
 const old=globalThis.localStorage,map=new Map();globalThis.localStorage=storage(map);
 try{
  const a=new DriveSettingsClient();a.token='short';a.clientId='test-id';a.expires=Date.now()+1000;a.enableAuto();
  const r=JSON.parse(map.get('kondate.drive-autosync-token.v1'));
  r.expires=Date.now()-100;
  map.set('kondate.drive-autosync-token.v1',JSON.stringify(r));
  const b=new DriveSettingsClient();
  assert.equal(b.restoreAuto('test-id'),false);
  assert.equal(b.autoEnabled,true);
  assert.equal(b.reauthRequired,true);
  assert.equal(map.has('kondate.drive-autosync-token.v1'),false);
 }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
test('auto sync checks Drive revision before write and rejects stale device',async()=>{
 let version='3',updates=0;
 const client=new DriveSettingsClient(async (url,request)=>{
  if(url.includes('/drive/v3/files?')&&request.method==='GET')
   return reply({files:[{id:'file-1',name:'kondate-settings.json',version,modifiedTime:'2026-10-09T00:00:00Z'}]});
  if(url.includes('/upload/drive/v3/files/')&&request.method==='PATCH'){
   updates++;version='4';return reply({});
  }
  throw Error('Unexpected request '+request.method+' '+url);
 });
 client.token='fake';client.expires=Date.now()+120000;
 await assert.rejects(()=>client.saveChecked({settings:{}},'2'),/他の端末で設定/);
 assert.equal(updates,0);
 assert.equal(await client.saveChecked({settings:{}},'3'),'4');
 assert.equal(updates,1);
});

test('saveChecked trusts the upload version instead of a stale file-list result',async()=>{
 let lists=0,uploads=0;
 const client=new DriveSettingsClient(async(url,options)=>{
  const reply=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  if(url.includes('/drive/v3/files?')&&options.method==='GET'){
   lists++;
   return reply({files:[{id:'file-1',name:'kondate-settings.json',version:'12'}]});
  }
  if(url.includes('/upload/drive/v3/files/')&&options.method==='PATCH'){
   uploads++;
   assert.match(url,/fields=id,version,modifiedTime/);
   return reply({id:'file-1',version:'13'});
  }
  throw Error('Unexpected request '+url);
 });
 client.token='fake';client.expires=Date.now()+120000;
 assert.equal(await client.saveChecked({settings:{theme:'green'}},'12'),'13');
 assert.equal(lists,1,'no metadata fetch after an authoritative PATCH response');
 assert.equal(uploads,1);
});
