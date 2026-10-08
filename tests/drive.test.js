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
