import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
test('authentication warning takes priority over ordinary status messages',()=>{
 assert.match(app,/const message=warning&&driveWarning\?/);
 assert.match(app,/classList\.toggle\('auth-required',warning\|\|driveWarning\)/);
 assert.match(app,/カレンダーとDriveの再認証が必要です/);
 assert.match(app,/カレンダーの再認証が必要です/);
 assert.match(app,/Driveの再認証が必要です/);
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
