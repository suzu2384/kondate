import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FamilyDriveClient,FamilySync,SHOPPING_SYNC_SECONDS,SHARE_SCOPE,SHARE_JOIN_SCOPE,sharedSpreadsheetId,sharedSpreadsheetUrl,ownedShareQuery,diffSnapshots,replayOps,validateSharedOp,describeSharedApiFailure} from '../src/family-share.js';
import {shoppingSharedSnapshot,applyShoppingEvents,masterSharedSnapshot,applyMasterEvents} from '../src/family-data.js';
import {shoppingItems} from '../src/shopping.js';
import {buildMaster} from '../src/model.js';
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
test('Google APIs use limited owner authorization and the Sheets append API for writes',()=>{
 const src=file('src/family-share.js');
 assert.match(src,/https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
 assert.match(src,/':append\?valueInputOption=RAW/);
 assert.match(src,/\bappendRows\(id,rows\)/);
 assert.match(src,/\/permissions\?sendNotificationEmail=true/);
 assert.equal(src.includes("gapi.load('picker'"),false);
 assert.ok(src.includes('https://www.googleapis.com/auth/spreadsheets'));
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
 assert.doesNotMatch(html,/apis\.google\.com\/js\/api\.js/);
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

test('Sheets 403 SERVICE_DISABLED identifies spreadsheet creation and the failing Cloud project',async()=>{
 const client=new FamilyDriveClient(async()=>({
  ok:false,status:403,json:async()=>({error:{code:403,status:'PERMISSION_DENIED',
   message:'Google Sheets API has not been used in this project.',
   details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'SERVICE_DISABLED',
    metadata:{service:'sheets.googleapis.com',consumer:'projects/123456789012'}}]
  }})
 }));
 client.token='test-token';client.expires=Date.now()+60000;
 await assert.rejects(client.create('master'),error=>{
  assert.match(error.message,/共有ファイルの作成/);
  assert.match(error.message,/Google Sheets API／HTTP 403／SERVICE_DISABLED/);
  assert.match(error.message,/プロジェクト 123456789012/);
  assert.match(error.message,/対象APIを有効化/);
  assert.doesNotMatch(error.message,/test-token/);
  return true;
 });
});

test('403 from Drive invite is distinguished from a Sheets write error',async()=>{
 const client=new FamilyDriveClient(async()=>({ok:false,status:403,json:async()=>({
  error:{message:'The caller does not have permission.',status:'PERMISSION_DENIED',
   details:[{reason:'domainPolicy'}]}
 })}));
 client.token='test-token';client.expires=Date.now()+60000;
 await assert.rejects(client.invite('abcdefghijklmnop123456','relative@example.com'),error=>{
  assert.match(error.message,/共有相手への編集権限の付与/);
  assert.match(error.message,/Google Drive API／HTTP 403／domainPolicy/);
  assert.match(error.message,/外部共有制限/);
  assert.doesNotMatch(error.message,/Google Sheets APIの有効化を確認/);
  return true;
 });
});

test('403 OAuth scope error clears old sharing token and asks for re-consent',async()=>{
 const client=new FamilyDriveClient(async()=>({ok:false,status:403,json:async()=>({error:{
  message:'Request had insufficient authentication scopes.',
  details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]
 }})}));
 client.token='expired-scope-token';client.expires=Date.now()+60000;
 await assert.rejects(client.sheets('/spreadsheets/abcdefghijklmnop123456/values/Ops!A:B:append',{method:'POST',body:{}}),
  /共有データの書き込み.*ACCESS_TOKEN_SCOPE_INSUFFICIENT/);
 assert.equal(client.connected,false);
 assert.equal(client.forceConsent,true);
});

test('Google HTTP errors without JSON still identify the API and operation',async()=>{
 const client=new FamilyDriveClient(async()=>({ok:false,status:403,json:async()=>{throw Error('invalid JSON');}}));
 client.token='test-token';client.expires=Date.now()+60000;
 await assert.rejects(client.sheets('/spreadsheets',{method:'POST',body:{}}),error=>{
  assert.match(error.message,/共有ファイルの作成.*HTTP 403/);
  return true;
 });
 assert.match(describeSharedApiFailure(429,{error:{message:'Rate limit exceeded'}},
   'https://sheets.googleapis.com/v4','/spreadsheets','POST'),/HTTP 429/);
});

test('shopping share-start evaluates real familySnapshot without shadowing data()',()=>{
 const src=file('src/app.js');
 const start=src.indexOf('function familySnapshot(type){');
 const end=src.indexOf('function persist(){',start);
 assert.ok(start>=0&&end>start,'the production familySnapshot() should be testable');
 const state={shopping:{servings:2,selected:['肉じゃが'],manual:[],checked:{},excluded:{}}};
 const recipes=[{name:'肉じゃが',category:'main',ingredients:[{name:'じゃがいも',quantity:100,unit:'g'}]}];
 const entry={id:'',owner:false,shadow:{}};
 const family={entry:type=>type==='shopping'?entry:{id:''}};
 let accessed=0;
 const data=()=>{accessed++;return {aliases:{}};};
 const construct=new Function('shoppingItems','shoppingSharedSnapshot','state','family','master','data',
  'masterSharedSnapshot','categoryName','editedFamilyDishes',
  src.slice(start,end)+'\nreturn familySnapshot;');
 const snapshot=construct(shoppingItems,shoppingSharedSnapshot,state,family,()=>recipes,data,
  masterSharedSnapshot,()=> '主菜',new Set());
 const result=snapshot('shopping');
 assert.ok(accessed>0,'the existing data() function must execute');
 assert.equal(result.servings,2);
 assert.equal(result['selected:肉じゃが'],'肉じゃが');
 assert.equal(result['ingredient:auto:じゃがいも|g'].baseQuantity,200);
 // Joining the shopping list without the recipe master must retain remotely
 // shared auto ingredients rather than silently removing them.
 entry.id='abcdefghijklmnop123';entry.owner=false;
 entry.shadow={'ingredient:auto:保存済み|g':{name:'保存済み',baseQuantity:50}};
 assert.deepEqual(snapshot('shopping')['ingredient:auto:保存済み|g'],entry.shadow['ingredient:auto:保存済み|g']);
 const masterData=snapshot('master');
 assert.equal(masterData['dish:肉じゃが'].name,'肉じゃが');
 assert.equal(masterData['dish:肉じゃが'].ingredients[0].quantity,100);
});

test('identical independently edited recipe does not report a conflict',async()=>{
 const client=fakeClient(),a=new FamilySync(client,storage()),b=new FamilySync(client,storage());
 const original={'dish:肉じゃが':{name:'肉じゃが',category:'main',method:'煮る'}};
 const id=await a.start('master',original,'member@example.com');
 await b.join('master',id,async()=>{});
 const updated={'dish:肉じゃが':{name:'肉じゃが',category:'main',method:'炒める'}};
 a.observe('master',updated);
 b.observe('master',updated);
 await a.sync('master',async()=>{});
 const result=await b.sync('master',async()=>{});
 assert.deepEqual(result.conflicts,[],'the same changes on both devices are not a conflict');
 await a.sync('master',async()=>{});
 await b.sync('master',async()=>{});
 assert.deepEqual(a.entry('master').queue,[]);
 assert.deepEqual(b.entry('master').queue,[]);
});

test('non-recipe edits never republish a joined device personal catalog',()=>{
 const app=file('src/app.js'),from=app.indexOf('function familySnapshot(type){');
 const to=app.indexOf('function persist(){',from);
 assert.ok(from>=0&&to>from);
 const shared=masterSharedSnapshot([dish,{name:'カレー',category:'main',protein:'肉',method:'煮る',genre:'洋食'}]);
 const shadow=structuredClone(shared);
 let current=[
  {...dish,method:'焼く',ingredients:[{name:'牛肉',quantity:100,unit:'g'}]},
  {name:'カレー',category:'main',protein:'肉',method:'煮る',genre:'洋食'},
  {name:'相手の個人用料理',category:'main',method:'蒸す'}
 ];
 const edits=new Set(),family={entry:()=>({id:'spreadsheet-id',owner:false,shadow})};
 const take=new Function('shoppingItems','shoppingSharedSnapshot','state','family','master','data',
  'masterSharedSnapshot','categoryName','editedFamilyDishes',
  app.slice(from,to)+'\nreturn familySnapshot;');
 const snapshot=take(shoppingItems,shoppingSharedSnapshot,{shopping:{}},family,()=>current,()=>({aliases:{}}),
  masterSharedSnapshot,()=> '主菜',edits);
 assert.deepEqual(snapshot('master'),shared,'existing remote dishes stay unchanged, personal dishes never leak');
 edits.add('dish:肉じゃが');
 const changed=snapshot('master');
 assert.equal(changed['dish:肉じゃが'].method,'焼く','explicitly edited recipe is published');
 assert.deepEqual(changed['dish:カレー'],shared['dish:カレー'],'unrelated shared recipe is preserved');
 assert.equal(changed['dish:相手の個人用料理'],undefined,'private dish stays private');
 edits.clear();
 assert.deepEqual(snapshot('master'),shared);
});

test('shared spreadsheet IDs are extracted only from supported Google Sheets URLs',()=>{
 const id='abcdEFGHijklMNOP123456789-_';
 assert.equal(sharedSpreadsheetId('https://docs.google.com/spreadsheets/d/'+id+'/edit?usp=sharing'),id);
 assert.equal(sharedSpreadsheetId('https://drive.google.com/open?id='+id),id);
 assert.equal(sharedSpreadsheetId(id),id);
 for(const raw of ['','not-a-spreadsheet','https://example.com/spreadsheets/d/'+id,
  'http://docs.google.com/spreadsheets/d/'+id,'https://docs.google.com/other/d/'+id,
  'https://docs.google.com.evil.invalid/spreadsheets/d/'+id]){
  assert.equal(sharedSpreadsheetId(raw),'',raw);
 }
 assert.equal(file('src/app.js').includes('familyClient.pick('),false);
 const app=file('src/app.js');
 assert.ok(app.includes('familyClient.authorize(GOOGLE_CLIENT_ID,{join:true})'));
 assert.ok(app.includes('id=sharedSpreadsheetId('));
 assert.match(app,/family-copy-link/);
 assert.match(app,/family-renew/);
});
test('owner uses drive.file only, link participants request Sheets permission',async()=>{
 const old=globalThis.google;
 const seen=[];
 globalThis.google={accounts:{oauth2:{
  initTokenClient({scope,callback}){seen.push(scope);return {requestAccessToken(){callback({access_token:'fake',expires_in:1800});}};},
  hasGrantedAllScopes(){return true;}
 }}};
 try{
  const client=new FamilyDriveClient(async()=>({ok:false,status:403,json:async()=>({})}));
  await client.authorize('mock-client-id');
  assert.equal(seen[0],SHARE_SCOPE);
  await client.authorize('mock-client-id',{join:true});
  assert.equal(seen[1],SHARE_JOIN_SCOPE);
  await client.authorize('mock-client-id',{join:true});
  assert.equal(seen.length,2,'already elevated tokens are reused');
  client.invalidateAccess();
  assert.equal(client.scopes,SHARE_SCOPE);
 }finally{globalThis.google=old;}
});
test('no Picker library or build key is required for shared link joining',()=>{
 const html=file('index.html'),app=file('src/app.js'),build=file('scripts/build.js'),config=file('src/config.js'),workflow=file('.github/workflows/pages.yml');
 for(const src of [html,app,build,config,workflow]){
  for(const key of ['GOOGLE_PICKER_API_KEY','GOOGLE_PROJECT_NUMBER','KONDATE_GOOGLE_PICKER','apis.google.com/js/api.js'])
   assert.equal(src.includes(key),false,key);
 }
 assert.match(app,/共有ファイルのURL/);
 assert.match(app,/family-copy-link/);
});

test('recipe ingredient edits are appended as JSON and confirmed by a second sync',async()=>{
 const client=fakeClient(),sync=new FamilySync(client,storage());
 const initial=masterSharedSnapshot([{name:'肉じゃが',category:'main',ingredients:[]}]);
 const id=await sync.start('master',initial,'other@example.com');
 const updatedMaster=buildMaster([],{},{'肉じゃが':{ingredients:[{name:'にんじん',quantity:80,unit:'g'}]}},
  [{name:'肉じゃが',category:'main',protein:'肉',method:'煮る',genre:'和食'}]);
 const modified=masterSharedSnapshot(updatedMaster.map(d=>({...d,categoryName:'主菜'})));
 const shadow={...sync.entry('master').shadow};
 const edited=new Set(['dish:肉じゃが']);
 const current={...shadow};
 for(const key of edited)current[key]=modified[key];
 assert.equal(sync.observe('master',current),1);
 assert.equal(sync.entry('master').queue.length,1);
 const first=await sync.sync('master',async()=>{});
 assert.equal(first.pending,1,'appending is not yet an acknowledgement');
 assert.equal(sync.entry('master').queue.length,1);
 const second=await sync.sync('master',async()=>{});
 assert.equal(second.pending,0,'the subsequent read acknowledges the exact edit');
 const tail=client.files.get(id).at(-1);
 const operation=JSON.parse(tail[1]);
 assert.equal(tail[0],operation.id);
 assert.equal(operation.key,'dish:肉じゃが');
 assert.deepEqual(operation.value.ingredients,[{name:'にんじん',quantity:80,unit:'g'}]);
 const recipient=new FamilySync(client,storage()),applied=[];
 await recipient.join('master',id,async rows=>applied.push(...rows));
 const joinedScope={manual:[],metadata:{},aliases:{}};
 applyMasterEvents(joinedScope,applied);
 assert.equal(joinedScope.metadata['肉じゃが'].ingredients[0].quantity,80);
});
test('repeated edits by the same device do not create a false remote conflict',async()=>{
 const client=fakeClient(),sync=new FamilySync(client,storage()),id=await sync.start('master',{'dish:肉じゃが':{name:'肉じゃが',category:'main',ingredients:[]}},'a@example.com');
 const first={'dish:肉じゃが':{name:'肉じゃが',category:'main',ingredients:[{name:'大根',quantity:30,unit:'g'}]}};
 const latest={'dish:肉じゃが':{name:'肉じゃが',category:'main',ingredients:[{name:'大根',quantity:60,unit:'g'}]}};
 sync.observe('master',first);
 await sync.sync('master',async()=>{});
 sync.observe('master',latest);
 const result=await sync.sync('master',async()=>{});
 assert.deepEqual(result.conflicts,[],'an earlier unsent operation echo is not a competing user');
 await sync.sync('master',async()=>{});
 assert.equal(sync.entry('master').queue.length,0);
 const rows=client.files.get(id).slice(1).map(row=>JSON.parse(row[1]));
 assert.equal(replayOps({},rows)['dish:肉じゃが'].ingredients[0].quantity,60);
});
test('shared sync reports expired authentication without silently losing local edits',async()=>{
 const app=file('src/app.js');
 const start=app.indexOf('async function syncFamily(type,{manual=false}={}){'),end=app.indexOf('function familyDialog(',start);
 assert.ok(start>=0&&end>start);
 const entry={id:'abcdefghijklmnopqrstuvwxyz',queue:[{key:'dish:肉じゃが'}]};
 const family={entry:()=>entry},notifications=[];
 const run=new Function('family','familyClient','document','notify','tab','applyFamily','render','lastFamilyPoll',
  app.slice(start,end)+'\nreturn syncFamily;');
 const sync=run(family,{connected:false},{hidden:false},message=>notifications.push(message),
  'master',async()=>{},()=>{}, {master:0,shopping:0});
 const idle=await sync('master');
 assert.equal(idle.pending,1);
 assert.equal(notifications.length,1);
 assert.match(notifications[0].summary,/再認証・同期/);
 await assert.rejects(sync('master',{manual:true}),/再認証・同期/);
 assert.equal(entry.queue.length,1,'an unsent edit must remain durable');
});
test('manual shared sync confirms the acknowledged append and shows a success notice',async()=>{
 const client=fakeClient(),family=new FamilySync(client,storage());
 const old=masterSharedSnapshot([dish]),id=await family.start('master',old,'relative@example.com');
 const edited={...old,'dish:肉じゃが':{...old['dish:肉じゃが'],ingredients:[{name:'牛肉',quantity:140,unit:'g'}]}};
 family.observe('master',edited);
 const app=file('src/app.js');
 const start=app.indexOf('async function syncFamily(type,{manual=false}={}){'),end=app.indexOf('function familyDialog(',start);
 const run=new Function('family','familyClient','document','notify','tab','applyFamily','render','lastFamilyPoll',
  app.slice(start,end)+'\nreturn syncFamily;');
 const notifications=[],sync=run(family,client,{hidden:false},note=>notifications.push(note),
  'master',async()=>{},()=>{}, {master:0,shopping:0});
 const response=await sync('master',{manual:true});
 assert.equal(response.pending,0);
 assert.equal(family.entry('master').queue.length,0);
 assert.match(notifications.at(-1),/共有ファイルに反映/);
 const journal=client.files.get(id).slice(1).map(row=>JSON.parse(row[1]));
 assert.equal(replayOps({},journal)['dish:肉じゃが'].ingredients[0].quantity,140);
});

test('findOwned searches only the app-accessible spreadsheets owned by the account',async()=>{
 const id='abcdefghijklmnop1234567890',id2='mnopqrstuvwxyzABCDEFGHIJKL';
 const seen=[];
 const client=new FamilyDriveClient(async(url,options)=>{
  const parsed=new URL(url),q=parsed.searchParams.get('q'),page=parsed.searchParams.get('pageToken');
  seen.push({url,auth:options.headers.Authorization,q,page});
  if(!page)return {ok:true,json:async()=>({
   nextPageToken:'next-page',
   files:[
    {id,name:'KonDate 共有料理マスター',mimeType:'application/vnd.google-apps.spreadsheet',ownedByMe:true},
    {id:id2,name:'KonDate 共有料理マスター',mimeType:'application/vnd.google-apps.spreadsheet',ownedByMe:false},
    {id:id2,name:'別のファイル',mimeType:'application/vnd.google-apps.spreadsheet',ownedByMe:true}
   ]
  })};
  return {ok:true,json:async()=>({files:[
   {id,name:'KonDate 共有料理マスター',mimeType:'application/vnd.google-apps.spreadsheet',ownedByMe:true},
   {id:id2,name:'KonDate 共有料理マスター',mimeType:'application/vnd.google-apps.spreadsheet',ownedByMe:true}
  ]})};
 });
 client.token='test-access';client.expires=Date.now()+60000;
 const list=await client.findOwned('master');
 assert.deepEqual(list.map(x=>x.id),[id,id2]);
 assert.equal(seen.length,2,'Drive pagination and duplicate elimination');
 assert.ok(seen.every(x=>x.auth==='Bearer test-access'));
 assert.ok(seen.every(x=>x.q.includes("'me' in owners")));
 assert.ok(seen.every(x=>x.q.includes("name = 'KonDate 共有料理マスター'")));
 assert.match(ownedShareQuery('shopping'),/KonDate 共有買い物リスト/);
 assert.equal(sharedSpreadsheetUrl(id),'https://docs.google.com/spreadsheets/d/'+id+'/edit');
 assert.throws(()=>ownedShareQuery('other'),/不正/);
});
test('discovery restores an unlinked owner automatically and skips active recipients',async()=>{
 const source=file('src/app.js'),start=source.indexOf('const ownedFamilyMatches=');
 const end=source.indexOf('function familyDialog(type){',start);
 assert.ok(start>=0&&end>start);
 const fakeDom={open:true},status={dataset:{kind:'master'},textContent:''},url={value:''},
  copy={disabled:true},stateLabel={textContent:''},open={hidden:true,href:''},
  startButton={textContent:'共有を開始'};
 const nodes={'#dialog':fakeDom,'#family-owned-results':status,'#family-join-link':url,
  '#family-copy-current':copy,'#family-share-status':stateLabel,'#family-current-file':open,
  '#dialog [data-action="family-start"]':startButton};
 nodes['#dialog [data-action="family-stop"]']={hidden:true};
 nodes['#dialog [data-action="family-renew"]']={hidden:true};
 const $=key=>nodes[key]||null;
 const ownerClient=fakeClient(),ownerSync=new FamilySync(ownerClient,storage());
 const id=await ownerSync.start('master',{'dish:肉じゃが':{name:'肉じゃが',category:'main'}},'a@example.com');
 const recipient=new FamilySync(ownerClient,storage()),applied=[];
 let lookups=0,authorization=0,renders=0;
 const client={
  async authorize(){authorization++;},
  async findOwned(){lookups++;return [{id,name:'KonDate 共有料理マスター'}];}
 };
 const build=new Function('$','family','familyClient','GOOGLE_CLIENT_ID','sharedSpreadsheetUrl',
  'applyFamily','render','esc','button',source.slice(start,end)+
  '\nreturn {discoverOwnedFamily,ownedFamilyMatches,ownedFamilyState};');
 const session=build($,recipient,client,'google-client-id',sharedSpreadsheetUrl,
  async (type,ops)=>applied.push(...ops),()=>{renders++;},x=>x,()=>'<button></button>');
 await session.discoverOwnedFamily('master');
 assert.equal(recipient.entry('master').id,id);
 assert.equal(recipient.entry('master').owner,true);
 assert.equal(applied.length,1);
 assert.equal(url.value,sharedSpreadsheetUrl(id));
 assert.equal(copy.disabled,false);
 assert.equal(startButton.textContent,'相手を追加');
 assert.equal(lookups,1);
 assert.equal(renders,1);
 // The same discovery on a device joined as recipient must do nothing.
 await recipient.join('master',id,async()=>{});
 await session.discoverOwnedFamily('master');
 assert.equal(recipient.entry('master').owner,false);
 assert.equal(lookups,1);
 assert.equal(authorization,1);
});
test('shared URL is shown in the same editable field for both roles with adjacent copy',()=>{
 const src=file('src/app.js'),css=file('style.css');
 const start=src.indexOf('function familyDialog(type){'),end=src.indexOf('async function copyFamilyUrl(',start);
 const dialog=src.slice(start,end);
 assert.match(dialog,/共有ファイルのURL/);
 assert.match(dialog,/class="family-link-row"/);
 assert.ok(dialog.includes('esc(sharedSpreadsheetUrl(d.id))'));
 assert.match(dialog,/button\('コピー','family-copy-link'/);
 assert.doesNotMatch(dialog,/他人の共有リンク/);
 assert.match(css,/#dialog \.family-link-row\{display:flex/);
 assert.match(css,/#dialog \.family-link-row input\{flex:1 1 auto;min-width:0/);
});
test('recipient mode persists despite an owned match until user explicitly switches',async()=>{
 const client=fakeClient(),owner=new FamilySync(client,storage());
 const id=await owner.start('master',{'dish:肉じゃが':{name:'肉じゃが',category:'main'}},'relative@example.com');
 const joined=new FamilySync(client,storage());
 await joined.join('master',id,async()=>{});
 assert.equal(joined.entry('master').owner,false);
 const app=file('src/app.js');
 const joinCode=app.slice(app.indexOf('async function familyJoin(type){'),app.indexOf('\nfunction pollFamily(',app.indexOf('async function familyJoin(type){')));
 assert.doesNotMatch(joinCode,/return familyUseOwned/,'URL joining must not imply owner mode');
 await joined.join('master',id,async()=>{},{owner:true});
 assert.equal(joined.entry('master').owner,true);
 await joined.join('master',id,async()=>{});
 assert.equal(joined.entry('master').owner,false,'explicit URL participation sets recipient mode');
});
test('switching recipient to a new owned share preserves original until successful invitation',async()=>{
 const client=fakeClient(),first=new FamilySync(client,storage()),changing=new FamilySync(client,storage());
 const id=await first.start('shopping',{servings:2},'relative@example.com');
 await changing.join('shopping',id,async()=>{});
 client.create=async type=>{const next='owned-shopping-12345678901234567890';client.files.set(next,[['kondate-shared-v1',type]]);return next;};
 const original=client.invite;
 client.invite=async()=>{throw Error('invitation failed');};
 await assert.rejects(changing.start('shopping',{servings:4},'relative@example.com',{replace:true}),/invitation failed/);
 assert.equal(changing.entry('shopping').id,id);
 assert.equal(changing.entry('shopping').owner,false);
 client.invite=original;
 const newId=await changing.start('shopping',{servings:4},'relative@example.com',{replace:true});
 assert.notEqual(newId,id);
 assert.equal(changing.entry('shopping').owner,true);
 assert.equal(replayOps({},client.files.get(newId).slice(1).map(row=>JSON.parse(row[1]))).servings,4);
 assert.equal(replayOps({},client.files.get(id).slice(1).map(row=>JSON.parse(row[1]))).servings,2);
});
test('active recipient cannot abandon unsent changes when starting their own share',async()=>{
 const client=fakeClient(),owner=new FamilySync(client,storage()),recipient=new FamilySync(client,storage());
 const id=await owner.start('shopping',{servings:2},'relative@example.com');
 await recipient.join('shopping',id,async()=>{});
 recipient.observe('shopping',{servings:3});
 await assert.rejects(recipient.start('shopping',{servings:4},'relative@example.com',{replace:true}),/未送信/);
 assert.equal(recipient.entry('shopping').owner,false);
 assert.equal(recipient.entry('shopping').queue.length,1);
});
