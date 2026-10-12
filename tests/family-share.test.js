import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FamilyDriveClient,FamilySync,SHOPPING_SYNC_SECONDS,diffSnapshots,replayOps,validateSharedOp} from '../src/family-share.js';
import {shoppingSharedSnapshot,applyShoppingEvents,masterSharedSnapshot,applyMasterEvents} from '../src/family-data.js';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const storage=()=>{const d=new Map();return {getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,v),removeItem:k=>d.delete(k)};};
const fakeClient=()=>({
 connected:true,files:new Map(),sentInvites:[],
 async create(type){const id='family'+type+'0123456789012345';this.files.set(id,[['kondate-shared-v1',type]]);return id;},
 async invite(id,email){this.sentInvites.push({id,email});},
 async appendRows(id,rows){if(!this.files.has(id))throw Error('file missing');this.files.get(id).push(...rows);},
 async readRows(id,start=1){if(!this.files.has(id))throw Error('file missing');return this.files.get(id).slice(start-1)}
});
const dish={name:'肉じゃが',category:'main',protein:'肉',method:'煮る',genre:'和食',ingredients:[{name:'牛肉',quantity:60,unit:'g'}]};
test('shared payload keeps recipe and ingredient metadata but excludes private calendar details',()=>{
 const snap=masterSharedSnapshot([{...dish,count:30,lastDate:'2026-10-01',dates:['2026-10-01'],location:'個人宅',raw:{secret:'token'}}]);
 assert.deepEqual(Object.keys(snap),['dish:肉じゃが']);
 assert.equal(snap['dish:肉じゃが'].ingredients[0].quantity,60);
 const text=JSON.stringify(snap);
 for(const x of ['2026-10-01','個人宅','secret','token','lastDate','count'])assert.equal(text.includes(x),false);
 const scope={manual:[],metadata:{},aliases:{}};
 applyMasterEvents(scope,[{key:'dish:肉じゃが',value:snap['dish:肉じゃが']}]);
 assert.equal(scope.manual[0].name,'肉じゃが');
 assert.equal(scope.metadata['肉じゃが'].ingredients[0].quantity,60);
});
test('shopping operations use independently addressable keys for concurrent check changes',()=>{
 const initial=shoppingSharedSnapshot({servings:1,selected:['肉じゃが'],manual:[],checked:{},excluded:{}});
 const a={...initial,'checked:auto:牛乳|ml':'ml:1000'};
 const b={...initial,'checked:auto:卵|個':'個:6'};
 const opsA=diffSnapshots(initial,a,'shopping',()=> 'clientA-123456');
 const opsB=diffSnapshots(initial,b,'shopping',()=> 'clientB-123456');
 assert.equal(opsA.length,1);assert.equal(opsB.length,1);
 assert.notEqual(opsA[0].key,opsB[0].key);
 const combined=applyShoppingEvents({},[...opsA,...opsB],true);
 assert.equal(combined.checked['auto:牛乳|ml'],'ml:1000');
 assert.equal(combined.checked['auto:卵|個'],'個:6');
});
test('one-person default and all shopping states roundtrip across shared ops',()=>{
 const s={servings:5,selected:['肉じゃが'],manual:[{id:'abcdef123456',name:'牛乳',quantity:1,unit:'L'}],
  checked:{'auto:卵|個':'個:6'},excluded:{'auto:砂糖|g':true}};
 const rows=diffSnapshots({},shoppingSharedSnapshot(s),'shopping',()=> 'baseline-123456');
 assert.deepEqual(applyShoppingEvents({},rows,true),s);
});
test('sharing creates a Drive-accessible spreadsheet, writes state and invites an editor',async()=>{
 const client=fakeClient(),sync=new FamilySync(client,storage());
 const initial={'servings':1,'selected:肉じゃが':'肉じゃが'};
 const id=await sync.start('shopping',initial,'family@example.com');
 assert.equal(client.sentInvites[0].email,'family@example.com');
 assert.equal(sync.entry('shopping').id,id);
 assert.equal(sync.entry('shopping').cursor,4);
 const join=new FamilySync(client,storage());
 let applied=[];
 await join.join('shopping',id,async rows=>{applied=rows;});
 assert.deepEqual(replayOps({},applied),initial);
 assert.equal(join.entry('shopping').cursor,4);
});
test('two collaborators append different item edits without losing either',async()=>{
 const client=fakeClient(),a=new FamilySync(client,storage()),b=new FamilySync(client,storage());
 const id=await a.start('shopping',{servings:1},'second@example.com');
 await b.join('shopping',id,async()=>{});
 a.observe('shopping',{servings:1,'checked:milk':'ml:1000'});
 b.observe('shopping',{servings:1,'checked:eggs':'個:6'});
 await Promise.all([a.sync('shopping',async()=>{}),b.sync('shopping',async()=>{})]);
 await Promise.all([a.sync('shopping',async()=>{}),b.sync('shopping',async()=>{})]);
 const events=client.files.get(id).slice(1).map(r=>JSON.parse(r[1]));
 const merged=replayOps({},events);
 assert.equal(merged['checked:milk'],'ml:1000');
 assert.equal(merged['checked:eggs'],'個:6');
 assert.equal(a.entry('shopping').queue.length,0);
 assert.equal(b.entry('shopping').queue.length,0);
});
test('a transport failure never discards an unsent purchase operation',async()=>{
 const client=fakeClient(),sync=new FamilySync(client,storage());
 await sync.start('shopping',{servings:1},'one@example.com');
 sync.observe('shopping',{servings:1,'excluded:auto:milk':true});
 const original=client.appendRows;
 client.appendRows=async()=>{throw Error('network failed');};
 await assert.rejects(sync.sync('shopping',async()=>{}),/network failed/);
 assert.equal(sync.entry('shopping').queue.length,1);
 client.appendRows=original;
 await sync.sync('shopping',async()=>{});
 await sync.sync('shopping',async()=>{});
 assert.equal(sync.entry('shopping').queue.length,0);
});
test('same-key collision is reported; last append remains deterministic',async()=>{
 const client=fakeClient(),a=new FamilySync(client,storage()),b=new FamilySync(client,storage());
 const id=await a.start('shopping',{servings:1},'two@example.com');
 await b.join('shopping',id,async()=>{});
 a.observe('shopping',{servings:2});
 b.observe('shopping',{servings:3});
 await a.sync('shopping',async()=>{});
 const conflict=await b.sync('shopping',async()=>{});
 assert.deepEqual(conflict.conflicts,['servings']);
 await b.sync('shopping',async()=>{});
 assert.equal(replayOps({},client.files.get(id).slice(1).map(r=>JSON.parse(r[1]))).servings,3);
});
test('Google APIs use drive.file authorization and only the Sheets append API for writes',()=>{
 const src=file('src/family-share.js');
 assert.match(src,/https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
 assert.match(src,/':append\?valueInputOption=RAW/);
 assert.match(src,/\bappendRows\(id,rows\)/);
 assert.match(src,/\/permissions\?sendNotificationEmail=true/);
 assert.match(src,/gapi\.load\('picker'/);
 assert.deepEqual(SHOPPING_SYNC_SECONDS,[3,5,10,15,30,60]);
 assert.throws(()=>validateSharedOp({kind:'shopping',key:'servings',id:'xxx',value:1,at:Date.now()},'shopping'),/不正/);
});
test('each tab opens its own share dialog, and foreground timer checks shopping every 5 seconds by default',()=>{
 const app=file('src/app.js'),css=file('style.css'),html=file('index.html');
 assert.match(app,/button\('共有','family-dialog','family-share-button mini', 'data-kind="master"'\)/);
 assert.match(app,/button\('共有','family-dialog','family-share-button mini','data-kind="shopping"'\)/);
 assert.match(app,/family\.settings\.seconds\*1000/);
 assert.match(app,/type==='master'\|\|tab==='shopping'/);
 assert.match(app,/type==='shopping'\?family\.settings\.seconds\*1000:state\.calendarRefreshMinutes\*60000/);
 assert.match(app,/if\(document\.hidden\|\|!familyClient\.connected\)return/);
 assert.match(app,/pollFamily\(true\)/);
 assert.match(app,/setInterval\(\(\)=>pollFamily\(\),1000\)/);
 assert.match(css,/\.shopping-toolbar \.family-share-button\{margin-left:auto/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(html,/apis\.google\.com\/js\/api\.js/);
});

test('shopping share includes computed auto ingredients, even if the recipient has no recipe master',()=>{
 const original={servings:1,selected:['肉じゃが'],manual:[],checked:{},excluded:{}};
 const auto=[{id:'auto:牛肉|g',kind:'auto',name:'牛肉',baseQuantity:60,baseUnit:'g',sourceNames:['肉じゃが']}];
 const data=shoppingSharedSnapshot(original,auto);
 assert.equal(data['ingredient:auto:牛肉|g'].baseQuantity,60);
 const serialized=JSON.stringify(data);
 assert.equal(serialized.includes('lastDate'),false);
 const app=file('src/app.js');
 assert.match(app,/const sharedRows=auto\.map/);
 assert.match(app,/checked:state\.shopping\.checked\[i\.id\]===signature/);
 assert.match(app,/if\(entry\.id&&!entry\.owner&&!family\.entry\('master'\)\.id\)/);
});

test('family sharing buttons remain visible in both tab toolbars on phones',()=>{
 const css=file('style.css'),app=file('src/app.js');
 const style=css.slice(css.lastIndexOf('/* Family share actions stay in the tab toolbar'));
 assert.ok(style.length>200,'Dedicated responsive styling for both family share buttons');
 assert.doesNotMatch(style,/family-share-button[^\n]*\{[^}]*display\s*:\s*none/);
 assert.doesNotMatch(css, /\.master-toolbar \.family-share-button,\.shopping-toolbar \.family-share-button\{display:none\}/);
 assert.match(style,/@media\(max-width:500px\)/);
 assert.match(style,/\.master-screen \.master-toolbar\{flex-wrap:nowrap/);
 assert.match(style,/\.shopping-screen \.shopping-toolbar\{flex-wrap:nowrap/);
 assert.match(style,/\.master-screen \.master-toolbar \.family-share-button\{margin-left:auto/);
 assert.match(style,/\.shopping-screen \.shopping-toolbar \.family-share-button\{margin-left:auto/);
 const master=app.slice(app.indexOf('function masterScreen(){'),app.indexOf('function refreshMasterRows(){'));
 const shopping=app.slice(app.indexOf('function shoppingScreen(){'),app.indexOf('function editShoppingManual('));
 assert.match(master,/\$\{button\('＋ 新規','add-master'/);
 assert.match(master,/\$\{button\('共有','family-dialog'.*data-kind="master"/);
 assert.ok(master.indexOf("button('共有','family-dialog'")>master.indexOf("button('＋ 新規','add-master'"));
 assert.match(shopping,/\$\{button\('未購入をコピー','shopping-copy'/);
 assert.match(shopping,/\$\{button\('共有','family-dialog'.*data-kind="shopping"/);
 assert.ok(shopping.indexOf("button('共有','family-dialog'")>shopping.indexOf("button('未購入をコピー','shopping-copy'"));
});
