import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FamilyDriveClient,FamilySync,SHOPPING_SYNC_SECONDS,SHARE_SCOPE,SHARE_JOIN_SCOPE,sharedSpreadsheetId,diffSnapshots,replayOps,validateSharedOp,describeSharedApiFailure} from '../src/family-share.js';
import {shoppingSharedSnapshot,applyShoppingEvents,masterSharedSnapshot,applyMasterEvents} from '../src/family-data.js';
import {shoppingItems} from '../src/shopping.js';
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
 assert.match(app,/共有リンク（参加するとき）/);
 assert.match(app,/リンクをコピー/);
});
