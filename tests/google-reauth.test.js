import test from 'node:test';
import assert from 'node:assert/strict';
import {CalendarClient,SCOPES} from '../src/google.js';
import {DriveSettingsClient,DRIVE_SCOPE} from '../src/drive.js';
import {expiredGoogleServices,expiredGoogleScopes,renewExpiredGoogleServices} from '../src/google-reauth.js';
const clientId='test.apps.googleusercontent.com';
function clients(){
 const c=new CalendarClient(),d=new DriveSettingsClient();
 c.clientId=clientId;d.clientId=clientId;
 return {c,d};
}
function connect(c,token='calendar-token'){
 c.token=token;c.expires=Date.now()+3600000;
}
function connectDrive(d,token='drive-token'){
 d.token=token;d.expires=Date.now()+3600000;
}
test('expired services scope detection never prompts Drive if not previously authorized',()=>{
 const {c,d}=clients();
 c.needsReauth=true;
 assert.deepEqual(expiredGoogleServices(c,d),{calendar:true,drive:false});
 assert.deepEqual(expiredGoogleScopes(expiredGoogleServices(c,d)),SCOPES.split(' '));
 d.token='previous-drive-token';d.expires=0;
 assert.deepEqual(expiredGoogleServices(c,d),{calendar:true,drive:true});
 assert.deepEqual(expiredGoogleScopes(expiredGoogleServices(c,d)),[...SCOPES.split(' '),DRIVE_SCOPE]);
});
test('Drive auto-sync expiry is recognized without an in-memory token',()=>{
 const prev=globalThis.localStorage;
 globalThis.localStorage={getItem:k=>k==='kondate.drive-autosync.v1'?'1':null};
 try{
  const {c,d}=clients();
  connect(c);
  assert.deepEqual(expiredGoogleServices(c,d),{calendar:false,drive:true});
 }finally{if(prev===undefined)delete globalThis.localStorage;else globalThis.localStorage=prev;}
});
async function oauthScenario(prepare){
 const original=globalThis.google;
 const calls=[];
 globalThis.google={accounts:{oauth2:{
  initTokenClient:options=>({requestAccessToken:args=>{
   calls.push({scopes:options.scope,args});
   // Simulate the real OAuth result with one access token for all requested scopes.
   options.callback({access_token:'refreshed-token',expires_in:3600,scope:options.scope});
  }}),
  hasGrantedAllScopes:(result,...scopes)=>scopes.every(scope=>result.scope.split(' ').includes(scope))
 }}};
 try{return await prepare(calls);}finally{if(original===undefined)delete globalThis.google;else globalThis.google=original;}
}
test('only calendar expired: request only Calendar scopes, leave valid Drive token untouched',async()=>{
 await oauthScenario(async calls=>{
  const {c,d}=clients();
  c.needsReauth=true;connectDrive(d);
  const refreshed=renewExpiredGoogleServices(c,d,clientId);
  assert.deepEqual(await refreshed,{calendar:true,drive:false});
  assert.equal(c.token,'refreshed-token');
  assert.equal(d.token,'drive-token');
  assert.deepEqual(calls[0].scopes.split(' '),SCOPES.split(' '));
  assert.equal(calls.length,1);
 });
});
test('only Drive expired: request only appdata, keep valid Calendar token',async()=>{
 await oauthScenario(async calls=>{
  const {c,d}=clients();
  connect(c);d.token='expired-drive';d.expires=Date.now()-1;
  assert.deepEqual(await renewExpiredGoogleServices(c,d,clientId),{calendar:false,drive:true});
  assert.equal(c.token,'calendar-token');
  assert.equal(d.token,'refreshed-token');
  assert.equal(calls[0].scopes,DRIVE_SCOPE);
  assert.equal(calls.length,1);
 });
});
test('both expired: one OAuth popup covers both scopes and shares token',async()=>{
 await oauthScenario(async calls=>{
  const {c,d}=clients();
  c.needsReauth=true;d.token='expired-drive';d.expires=Date.now()-1;
  const completed=renewExpiredGoogleServices(c,d,clientId);
  assert.deepEqual(await completed,{calendar:true,drive:true});
  assert.equal(c.token,'refreshed-token');assert.equal(d.token,'refreshed-token');
  assert.equal(c.needsReauth,false);
  assert.deepEqual(calls[0].scopes.split(' '),[...SCOPES.split(' '),DRIVE_SCOPE]);
  assert.equal(calls.length,1);
 });
});
test('if both tokens are active, do nothing and do not open popup',async()=>{
 const {c,d}=clients();connect(c);connectDrive(d);
 assert.deepEqual(await renewExpiredGoogleServices(c,d,clientId),{calendar:false,drive:false});
});
test('a denied scope does not replace either service token',async()=>{
 const original=globalThis.google;
 globalThis.google={accounts:{oauth2:{
  initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'partial',expires_in:3600,scope:SCOPES})}),
  hasGrantedAllScopes:(result,...scopes)=>scopes.every(scope=>result.scope.split(' ').includes(scope))
 }}};
 try{
  const {c,d}=clients();c.needsReauth=true;d.token='previous-drive';d.expires=0;
  await assert.rejects(renewExpiredGoogleServices(c,d,clientId),/権限/);
  assert.equal(c.token,null);
  assert.equal(d.token,'previous-drive');
 }finally{if(original===undefined)delete globalThis.google;else globalThis.google=original;}
});
test('the UI routes reauth buttons to the shared renewal but leaves initial login unchanged',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/function reauthenticateExpiredGoogle\(\)/);
 assert.match(app,/renewExpiredGoogleServices\(api,drive,GOOGLE_CLIENT_ID\)/);
 assert.match(app,/const expired=expiredGoogleServices\(api,drive\);if\(expired\.calendar\|\|expired\.drive\)return reauthenticateExpiredGoogle\(\)/);
 assert.match(app,/if\(expiredGoogleServices\(api,drive\)\.calendar\)return reauthenticateExpiredGoogle\(\)/);
 assert.match(app,/await api\.authorize\(GOOGLE_CLIENT_ID\)/);
 assert.match(app,/await drive\.authorize\(GOOGLE_CLIENT_ID\)/);
});
