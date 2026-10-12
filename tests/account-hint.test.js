import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preferredGoogleAccount,rememberGoogleAccount,forgetGoogleAccount,rememberCalendarAccount,rememberDriveAccount} from '../src/account-hint.js';
import {FamilyDriveClient} from '../src/family-share.js';

const client='kondate-test.apps.googleusercontent.com';
function storage(){
 const map=new Map();
 return {getItem:key=>map.get(key)||null,setItem:(key,v)=>map.set(key,v),removeItem:key=>map.delete(key)};
}
test('remember primary calendar account, never a shared calendar ID',()=>{
 const s=storage();
 assert.equal(preferredGoogleAccount(client,'calendar',s),'');
 assert.equal(rememberCalendarAccount(client,[{id:'coworker@example.com'},{id:'owner@example.com',primary:true}],s),true);
 assert.equal(preferredGoogleAccount(client,'calendar',s),'owner@example.com');
 assert.equal(preferredGoogleAccount(client,'share',s),'owner@example.com');
 assert.equal(rememberCalendarAccount(client,[{id:'other@example.com'}],s),false);
 assert.equal(preferredGoogleAccount('other.apps.googleusercontent.com','calendar',s),'');
});
test('per-service preferences and intentional sign-out are separate',()=>{
 const s=storage();
 rememberGoogleAccount(client,'calendar','calendar@example.com',s);
 rememberGoogleAccount(client,'share','family@example.com',s);
 assert.equal(preferredGoogleAccount(client,'share',s),'family@example.com');
 assert.equal(preferredGoogleAccount(client,'drive',s),'calendar@example.com');
 forgetGoogleAccount(client,'share',s);
 assert.equal(preferredGoogleAccount(client,'share',s),'calendar@example.com');
 assert.equal(rememberGoogleAccount(client,'drive','not-an-email',s),false);
});
test('Drive about API reads actual account without adding scopes, and gracefully fails offline',async()=>{
 const s=storage(),calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,authorization:options.headers.Authorization});
  return {ok:true,json:async()=>({user:{emailAddress:'drive@example.com'}})};
 };
 assert.equal(await rememberDriveAccount(client,'share','mock-token',fetcher,s),true);
 assert.equal(preferredGoogleAccount(client,'share',s),'drive@example.com');
 assert.equal(calls[0].url,'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
 assert.equal(calls[0].authorization,'Bearer mock-token');
 assert.equal(await rememberDriveAccount(client,'drive','invalid',async()=>{throw Error('offline');},s),false);
});
test('sharing uses remembered hint and explicit account switch forces Google chooser',async()=>{
 const oldLocal=globalThis.localStorage,oldSession=globalThis.sessionStorage,oldGoogle=globalThis.google;
 const s=storage();globalThis.localStorage=s;globalThis.sessionStorage=storage();
 const requests=[];
 globalThis.google={accounts:{oauth2:{
  initTokenClient:opts=>({requestAccessToken:arg=>{
   requests.push({opts,arg});opts.callback({access_token:'token',expires_in:3600});
  }}),
  hasGrantedAllScopes:()=>true
 }}};
 try{
  rememberGoogleAccount(client,'share','family@example.com',s);
  const api=new FamilyDriveClient(async()=>({ok:true,json:async()=>({user:{emailAddress:'family@example.com'}})}));
  await api.authorize(client);
  assert.equal(requests[0].opts.login_hint,'family@example.com');
  assert.equal(requests[0].arg.prompt,'');
  api.chooseAccountAgain(client);
  assert.equal(api.connected,false);
  await api.authorize(client);
  assert.equal(requests[1].opts.login_hint,undefined);
  assert.equal(requests[1].arg.prompt,'select_account');
 }finally{
  if(oldLocal===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldLocal;
  if(oldSession===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=oldSession;
  if(oldGoogle===undefined)delete globalThis.google;else globalThis.google=oldGoogle;
 }
});
test('Google authentication paths and family UI all use hints',()=>{
 const google=readFileSync(new URL('../src/google.js',import.meta.url),'utf8');
 const drive=readFileSync(new URL('../src/drive.js',import.meta.url),'utf8');
 const renewal=readFileSync(new URL('../src/google-reauth.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(google,/login_hint:preferredGoogleAccount\(clientId,'calendar'\)/);
 assert.match(google,/forgetGoogleAccount\(this.clientId,'calendar'\)/);
 assert.match(drive,/login_hint:preferredGoogleAccount\(clientId,'drive'\)/);
 assert.match(renewal,/login_hint:preferredGoogleAccount\(clientId,refresh.calendar\?'calendar':'drive'\)/);
 assert.match(app,/rememberCalendarAccount\(GOOGLE_CLIENT_ID,found\)/);
 assert.match(app,/familyClient.chooseAccountAgain\(GOOGLE_CLIENT_ID\)/);
 assert.match(sw,/src\/account-hint.js/);
});
