import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
test('authentication warning takes priority over ordinary status messages',()=>{
 assert.match(app,/const message=warning&&driveWarning\?/);
 assert.match(app,/classList\.toggle\('auth-required',warning\|\|driveWarning\)/);
 assert.match(app,/カレンダーとドライブの再認証が必要です/);
 assert.match(app,/カレンダーの再認証が必要です/);
 assert.match(app,/ドライブの再認証が必要です/);
 assert.match(app,/expiredGoogleServices\(api,drive\)/);
 assert.match(app,/if\(expired\.calendar\|\|expired\.drive\)return reauthenticateExpiredGoogle\(\)/);
});
test('persistent connection is an opt-in setting with a prominent status alert',()=>{
 assert.match(app,/id="keep-connected"/);
 assert.match(app,/api\.setKeepConnected\(el\.checked\)/);
 assert.match(css,/#status-bar\.auth-required/);
 assert.match(css,/background:#8a261a/);
});

test('Calendar reauthentication flag survives token removal and is prioritized over ordinary notifications',()=>{
 const google=readFileSync(new URL('../src/google.js',import.meta.url),'utf8');
 assert.match(google,/CONNECTION_MARKER='kondate\.google-calendar-authorized-client\.v1'/);
 assert.match(google,/if\(requiresLogin\)this\.rememberPreviousConnection\(\)/);
 assert.match(google,/this\.wasPreviouslyConnected\(clientId\)/);
 assert.match(google,/this\.forgetPreviousConnection\(\)/);
 const message=app.slice(app.indexOf('const message=warning&&driveWarning?'),app.indexOf('const pending=',app.indexOf('const message=warning&&driveWarning?')));
 assert.ok(message.indexOf('カレンダーの再認証が必要です')<message.indexOf(':currentNotice;'));
 assert.match(app,/setInterval\(updateConnection,30000\)/);
});


test('OAuth preparation does not leave a false error after its SDK becomes ready',async()=>{
 const {runInNewContext}=await import('node:vm');
 const begin=app.indexOf('const GOOGLE_AUTH_PREPARATION_MESSAGE=');
 const end=app.indexOf('function empty(',begin);
 assert.ok(begin>=0&&end>begin);
 let sdkReady,loads=0,dismissed=0;
 const ctx={
  GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',authReady:false,authLoadError:'',
  tab:'calendar',currentNotice:'Google認証を準備しています。少し待って再試行してください。',
  google:undefined,
  api:{loadIdentity:()=>{loads++;return new Promise(resolve=>{sdkReady=resolve;});}},
  dismissNotice:()=>{dismissed++;ctx.currentNotice='';},updateConnection:()=>{},render:()=>{},
  notify:message=>{throw Error('unexpected OAuth error '+message);}
 };
 const prepare=runInNewContext(app.slice(begin,end)+';prepareGoogleIdentity',ctx);
 prepare();prepare();
 assert.equal(loads,1,'multiple actions must not insert duplicate OAuth scripts');
 assert.equal(ctx.currentNotice,'Google認証を準備しています。少し待って再試行してください。');
 ctx.google={accounts:{oauth2:{}}};sdkReady();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.authReady,true);
 assert.equal(ctx.currentNotice,'');
 assert.equal(dismissed,1);
});
test('OAuth load success does not dismiss unrelated errors',async()=>{
 const {runInNewContext}=await import('node:vm');
 const begin=app.indexOf('const GOOGLE_AUTH_PREPARATION_MESSAGE=');
 const end=app.indexOf('function empty(',begin);
 const ctx={
  GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',authReady:false,authLoadError:'',
  tab:'calendar',currentNotice:'AIの生成エラー',google:undefined,
  api:{loadIdentity:()=>Promise.resolve()},
  dismissNotice:()=>{throw Error('unrelated error must stay visible');},
  updateConnection:()=>{},render:()=>{},notify:()=>{}
 };
 const prepare=runInNewContext(app.slice(begin,end)+';prepareGoogleIdentity',ctx);
 prepare();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ctx.currentNotice,'AIの生成エラー');
});
