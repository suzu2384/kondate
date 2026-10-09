import test from 'node:test';
import assert from 'node:assert/strict';
import {driveSettingsDigest,decideDriveSync} from '../src/drive-sync.js';
const remote={format:'kondate-drive-settings-v2',updatedAt:'2026-10-09T07:00:00Z',settings:{theme:{color:'green'},rules:{days:7}},master:{a:{manual:[]}}};
const changed={...remote,settings:{...remote.settings,theme:{color:'blue'}}};
const choose=o=>decideDriveSync({remoteExists:true,localDigest:'local',remoteDigest:'remote',baseDigest:'base',pending:true,remoteRevision:'9',baseRevision:'8',...o});
test('timestamp, JSON field order and Drive revision do not change the settings digest',async()=>{
 const alternate={updatedAt:'2026-10-09T09:00:00Z',master:{a:{manual:[]}},settings:{rules:{days:7},theme:{color:'green'}}};
 assert.equal(await driveSettingsDigest(remote),await driveSettingsDigest(alternate));
 assert.notEqual(await driveSettingsDigest(remote),await driveSettingsDigest(changed));
});
test('single device saved settings with stale metadata are equal, not a conflict',async()=>{
 const digest=await driveSettingsDigest(remote);
 assert.equal(choose({localDigest:digest,remoteDigest:digest,baseDigest:'older-base',pending:true,remoteRevision:'12',baseRevision:'10'}),'equal');
 assert.equal(choose({localDigest:digest,remoteDigest:digest,baseDigest:'',pending:true,remoteRevision:'12',baseRevision:'10'}),'equal');
});
test('only local settings changed: upload even if Drive metadata version advanced',async()=>{
 const base=await driveSettingsDigest(remote),local=await driveSettingsDigest(changed);
 assert.equal(choose({localDigest:local,remoteDigest:base,baseDigest:base,remoteRevision:'20',baseRevision:'10'}),'upload');
});
test('only Drive settings changed: download instead of reporting conflict',async()=>{
 const base=await driveSettingsDigest(remote),newRemote=await driveSettingsDigest(changed);
 assert.equal(choose({localDigest:base,remoteDigest:newRemote,baseDigest:base}),'download');
});
test('independent local and cloud edits from the same common base remain a real conflict',async()=>{
 const base=await driveSettingsDigest(remote),local=await driveSettingsDigest(changed);
 const remoteOther=await driveSettingsDigest({...remote,settings:{...remote.settings,rules:{days:14}}});
 assert.equal(choose({localDigest:local,remoteDigest:remoteOther,baseDigest:base}),'conflict');
});
test('initial setup with an existing Drive backup downloads it; an empty Drive uploads local settings',()=>{
 assert.equal(choose({localDigest:'new',remoteDigest:'old',baseDigest:'',pending:false,remoteRevision:'4',baseRevision:''}),'download');
 assert.equal(decideDriveSync({remoteExists:false,localDigest:'local'}),'upload');
 assert.equal(decideDriveSync({remoteExists:false,localDigest:'local',baseRevision:'5'}),'missing');
});
