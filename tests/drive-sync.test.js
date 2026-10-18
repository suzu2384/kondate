import test from 'node:test';
import assert from 'node:assert/strict';
import {driveSettingsDigest,decideDriveSync,driveSectionDigests,mergeIndependentDriveChanges,mergeDriveSnapshots} from '../src/drive-sync.js';
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

test('independent changes to the draft and settings safely merge both directions',async()=>{
 const base={...remote,settings:{...remote.settings,draft:[{dishes:[{name:'カレー',category:'main'}]}],recentNewMains:[]}};
 const hashes=await driveSectionDigests(base);
 const changedDraft={...base,settings:{...base.settings,draft:[{dishes:[{name:'煮魚',category:'main'}]}],recentNewMains:['特製炒め物']}};
 const changedTheme={...base,settings:{...base.settings,theme:{color:'blue'}}};
 for(const [local,cloud] of [[changedDraft,changedTheme],[changedTheme,changedDraft]]){
  const merged=await mergeIndependentDriveChanges(local,cloud,hashes);
  assert.deepEqual(merged.settings.draft,changedDraft.settings.draft);
  assert.deepEqual(merged.settings.recentNewMains,changedDraft.settings.recentNewMains);
  assert.deepEqual(merged.settings.theme,changedTheme.settings.theme);
 }
});
test('overlapping draft changes remain a conflict rather than silent overwrite',async()=>{
 const base={...remote,settings:{...remote.settings,draft:[]}};
 const hashes=await driveSectionDigests(base);
 const draft=name=>({...base,settings:{...base.settings,draft:[{dishes:[{name}]}]}});
 assert.equal(await mergeIndependentDriveChanges(draft('A'),draft('B'),hashes),null);
 assert.equal(await mergeIndependentDriveChanges(draft('A'),draft('B'),null),null);
 const a={...base,settings:{...base.settings,theme:{color:'red'}}};
 const b={...base,settings:{...base.settings,theme:{color:'blue'}}};
 assert.equal(await mergeIndependentDriveChanges(a,b,hashes),null);
});

test('different settings edited on two devices merge using the last confirmed base',()=>{
 const base={settings:{theme:{color:'green'},categoryCalendars:{main:'cal-A'},rules:{days:7}},master:{}};
 const a=structuredClone(base),b=structuredClone(base);
 a.settings.theme.color='blue';b.settings.categoryCalendars.main='cal-B';
 const result=mergeDriveSnapshots(a,b,base);
 assert.equal(result.settings.theme.color,'blue');
 assert.equal(result.settings.categoryCalendars.main,'cal-B');
 assert.equal(base.settings.theme.color,'green');
});
test('overlapping settings changes remain conflicts',()=>{
 const base={settings:{theme:{color:'green'}},master:{}};
 const a={settings:{theme:{color:'red'}},master:{}};
 const b={settings:{theme:{color:'blue'}},master:{}};
 assert.equal(mergeDriveSnapshots(a,b,base),null);
});
test('disjoint shopping flags, selected recipes and planned days merge',()=>{
 const day=name=>({id:name,dishes:[{name,category:'main'}]});
 const base={settings:{shopping:{checked:{one:'0'},selected:['味噌汁'],manual:[]},draft:[day('A'),day('B')]},master:{}};
 const a=structuredClone(base),b=structuredClone(base);
 a.settings.shopping.checked.two='1';
 a.settings.shopping.selected.push('カレー');a.settings.draft[0]=day('C');
 b.settings.shopping.checked.three='1';
 b.settings.shopping.selected.push('肉じゃが');b.settings.draft[1]=day('D');
 const result=mergeDriveSnapshots(a,b,base);
 assert.deepEqual(result.settings.shopping.checked,{one:'0',two:'1',three:'1'});
 assert.deepEqual(result.settings.shopping.selected,['味噌汁','カレー','肉じゃが']);
 assert.deepEqual(result.settings.draft,[day('C'),day('D')]);
});
test('two different edits to the same planned day are not merged',()=>{
 const day=name=>({dishes:[{name,category:'main'}]});
 const base={settings:{draft:[day('A')]},master:{}};
 const a={settings:{draft:[day('B')]},master:{}},b={settings:{draft:[day('C')]},master:{}};
 assert.equal(mergeDriveSnapshots(a,b,base),null);
});
test('independent recipe metadata and shopping entries merge',()=>{
 const item=id=>({id,name:id,quantity:1,unit:'個'});
 const base={settings:{shopping:{manual:[item('first')]}},master:{cal:{metadata:{curry:{method:'煮る'}},manual:[],aliases:{}}}};
 const a=structuredClone(base),b=structuredClone(base);
 a.settings.shopping.manual.push(item('second'));b.settings.shopping.manual.push(item('third'));
 a.master.cal.metadata.curry.method='焼く';
 b.master.cal.metadata.stew={method:'煮る'};
 const result=mergeDriveSnapshots(a,b,base);
 assert.deepEqual(result.settings.shopping.manual.map(i=>i.id),['first','second','third']);
 assert.equal(result.master.cal.metadata.curry.method,'焼く');
 assert.equal(result.master.cal.metadata.stew.method,'煮る');
});
test('a missing merge baseline never authorizes overwriting either side',()=>{
 assert.equal(mergeDriveSnapshots({settings:{theme:1}}, {settings:{theme:2}}, null),null);
});
