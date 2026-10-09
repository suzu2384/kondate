import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
test('authentication warning takes priority over ordinary status messages',()=>{
 assert.match(app,/const message=warning\?LOGIN_WARNING:driveWarning\?/);
 assert.match(app,/classList\.toggle\('auth-required',warning\|\|driveWarning\)/);
 assert.match(app,/LOGIN_WARNING='⚠ Googleの再認証が必要です/);
 assert.match(app,/api\.reauthenticationRequired&&!api\.connected\)return actions\.connect\(\)/);
});
test('persistent connection is an opt-in setting with a prominent status alert',()=>{
 assert.match(app,/id="keep-connected"/);
 assert.match(app,/api\.setKeepConnected\(el\.checked\)/);
 assert.match(css,/#status-bar\.auth-required/);
 assert.match(css,/background:#8a261a/);
});
