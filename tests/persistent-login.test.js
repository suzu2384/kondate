import test from 'node:test';
import assert from 'node:assert/strict';
import {CalendarClient} from '../src/google.js';
function storage(data){return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
test('explicit opt-in restores the valid browser session on the next app launch',()=>{
 const originalLocal=globalThis.localStorage,originalSession=globalThis.sessionStorage;
 const persistent=new Map(),tab=new Map();
 globalThis.localStorage=storage(persistent);globalThis.sessionStorage=storage(tab);
 try{
  const first=new CalendarClient();
  first.clientId='example-client';first.token='valid-test-value';first.expires=Date.now()+120000;
  first.rememberSession();assert.equal(persistent.size,0);
  first.setKeepConnected(true);
  tab.clear();
  const reopened=new CalendarClient();
  assert.equal(reopened.restoreSession('example-client'),true);
  assert.equal(reopened.connected,true);
  reopened.disconnect();
  assert.equal(persistent.size,0);
  assert.equal(reopened.keepConnected,false);
 }finally{
  if(originalLocal===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalLocal;
  if(originalSession===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=originalSession;
 }
});
test('expired device session requires authentication and is cleared',()=>{
 const oldLocal=globalThis.localStorage,oldSession=globalThis.sessionStorage;
 const persistent=new Map(),tab=new Map();
 globalThis.localStorage=storage(persistent);globalThis.sessionStorage=storage(tab);
 try{
  persistent.set('kondate.google-calendar-keep-connected.v1','1');
  persistent.set('kondate.google-calendar-token.v1',JSON.stringify({clientId:'example-client',token:'expired-test',expires:Date.now()-100}));
  const client=new CalendarClient();
  assert.equal(client.restoreSession('example-client'),false);
  assert.equal(client.reauthenticationRequired,true);
  assert.equal(persistent.has('kondate.google-calendar-token.v1'),false);
 }finally{
  if(oldLocal===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldLocal;
  if(oldSession===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=oldSession;
 }
});
