import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('settings sharing is visible and old duplicate Drive controls are removed',()=>{
 assert.match(app,/他の端末へ設定を引き継ぐ/);
 assert.match(app,/button\('Driveにバックアップ','drive-save'/);
 assert.match(app,/button\('Driveから復元','drive-load'/);
 assert.match(app,/Driveのバックアップを上書きしますか/);
});
test('restoring Drive settings keeps Google connected and resyncs calendar events',()=>{
 const block=app.slice(app.indexOf("'confirm-drive-load':"),app.indexOf("'add-icon-rule':"));
 assert.match(block,/restoreDriveSnapshot\(state,driveImported\)/);
 assert.match(block,/await sync\(\)/);
 assert.doesNotMatch(block,/api\.disconnect\(\)/);
});
test('full app source parses after Drive sharing UI changes',()=>{
 const check=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
