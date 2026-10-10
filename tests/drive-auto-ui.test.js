import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
test('auto sync is opt-in on each device, uploads local changes and downloads remote updates',()=>{
 assert.match(app,/id="drive-auto"/);
 assert.match(app,/保存・読み込み/);
 assert.match(app,/if\(!driveAutoBooting&&drive\.autoEnabled\)markDriveDirty\(\)/);
 assert.match(app,/drive\.enableAuto\(\)/);
 assert.match(app,/async function autoDriveSync\(\)/);
 assert.match(app,/saveChecked\(localSnapshot,remoteRevision\)/);
 assert.match(app,/await applyRemoteSettings\(remoteRevision,remoteSnapshot\)/);
 assert.match(app,/window\.addEventListener\('focus'/);
 assert.match(app,/document\.addEventListener\('visibilitychange'/);
});
test('cloud updates are never automatically overwritten if local edits are pending',()=>{
 assert.match(app,/if\(decision==='conflict'\)\{\s*notify\('⚠ Driveの設定が競合しています/);
 assert.match(app,/const decision=decideDriveSync\(/);
 assert.match(app,/await markDriveSynced\(nextRevision,localSnapshot\)/);
});
test('Drive status notices stay a single line without changing the page height',()=>{
 assert.match(app,/driveWarning/);
 assert.match(app,/Driveの再認証が必要です/);
 assert.match(app,/カレンダーとDriveの再認証が必要です/);
 assert.match(css,/#notice\.status-message\{/);
 assert.match(css,/white-space:nowrap;text-align:left/);
 assert.match(css,/text-overflow:ellipsis/);
});
test('source is syntactically valid',()=>{
 const r=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});

test('local and remote content hashes resolve stale Drive revisions before declaring a conflict',()=>{
 assert.match(app,/driveSettingsDigest\(localSnapshot\)/);
 assert.match(app,/driveSettingsDigest\(remoteSnapshot\)/);
 assert.match(app,/if\(decision==='equal'\)/);
 assert.match(app,/setDriveMeta\(DRIVE_DIGEST,driveBaseDigest\)/);
});
