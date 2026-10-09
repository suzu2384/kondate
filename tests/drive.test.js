import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveSettingsClient} from '../src/drive.js';

test('default Drive fetch keeps the browser global receiver',async()=>{
 const original=globalThis.fetch;
 let called=false;
 globalThis.fetch=function(url,options){
  assert.equal(this,globalThis,'Browser fetch must be invoked with its global receiver');
  assert.match(String(url),/\/drive\/v3\/files\?/);
  assert.match(options.headers.Authorization,/Bearer /);
  called=true;
  return Promise.resolve(new Response(JSON.stringify({files:[{id:'file-id',name:'kondate-settings.json'}]}),{status:200,headers:{'Content-Type':'application/json'}}));
 };
 try{
  const c=new DriveSettingsClient();c.token='fake-test-token';c.expires=Date.now()+60000;
  assert.equal((await c.find()).id,'file-id');
  assert.equal(called,true);
 }finally{globalThis.fetch=original;}
});

test('Drive AppDataFolder creates a backup file and uploads the JSON content',async()=>{
 const seen=[];
 const reply=body=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
 const c=new DriveSettingsClient(async (url,opts)=>{
  seen.push({url,method:opts.method,body:opts.body});
  if(url.includes('/drive/v3/files?')&&opts.method==='GET')return reply({files:[]});
  if(url.includes('/drive/v3/files?')&&opts.method==='POST'){
   assert.deepEqual(JSON.parse(opts.body).parents,['appDataFolder']);
   return reply({id:'backup-id'});
  }
  if(url.includes('/upload/drive/v3/files/backup-id?uploadType=media')){
   assert.equal(opts.method,'PATCH');
   assert.equal(JSON.parse(opts.body).format,'kondate-drive-settings-v2');
   return reply({id:'backup-id'});
  }
  throw Error('Unexpected Drive call '+url);
 });
 c.token='test';c.expires=Date.now()+120000;
 await c.save({format:'kondate-drive-settings-v2',settings:{}});
 assert.deepEqual(seen.map(x=>x.method),['GET','POST','PATCH']);
});
test('Drive AppDataFolder paginates file lookup and restores exact saved document',async()=>{
 const reply=body=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
 const snapshot={format:'kondate-drive-settings-v2',settings:{theme:{color:'green'}}};
 const c=new DriveSettingsClient(async url=>{
  const u=new URL(url);
  if(u.pathname==='/drive/v3/files'){
   assert.equal(u.searchParams.get('spaces'),'appDataFolder');
   if(!u.searchParams.has('pageToken'))return reply({files:[],nextPageToken:'next'});
   assert.equal(u.searchParams.get('pageToken'),'next');
   return reply({files:[{id:'file-id',name:'kondate-settings.json',modifiedTime:'2026-10-09T00:00:00Z'}]});
  }
  assert.match(u.pathname,/\/drive\/v3\/files\/file-id/);
  assert.equal(u.searchParams.get('alt'),'media');
  return reply(snapshot);
 });
 c.token='test';c.expires=Date.now()+120000;
 assert.deepEqual(await c.load(),snapshot);
});
