import {preferredGoogleAccount,rememberDriveAccount,forgetGoogleAccount} from './account-hint.js';
// Serverless family collaboration. Google Sheets is the append-only change journal;
// per-item operations avoid overwriting edits made by another device.
export const SHARE_SCOPE='https://www.googleapis.com/auth/drive.file';
export const SHARED_KINDS=['master','shopping'];
export const SHOPPING_SYNC_SECONDS=[3,5,10,15,30,60];
const STORAGE='kondate.family-share.v1',TOKEN_STORAGE='kondate.family-share.token.v1';
const MARKER='kondate-shared-v1';
const validId=id=>/^[a-zA-Z0-9_-]{15,180}$/.test(String(id||''));
const clone=v=>JSON.parse(JSON.stringify(v));
const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const blank=()=>({id:'',owner:false,cursor:1,queue:[],shadow:{},seen:[]});
export function validateSharedOp(op,type){
 if(!op||typeof op!=='object'||typeof op.id!=='string'||!/^[\w-]{12,90}$/.test(op.id)||
  op.kind!==type||op.value===undefined||typeof op.key!=='string'||op.key.length>280||
  !(type==='master'?op.key.startsWith('dish:'):type==='shopping'?/^(servings$|selected:|manual:|checked:|excluded:|ingredient:)/.test(op.key):false)||
  !Number.isFinite(op.at)||op.at<0||op.at>1e15||JSON.stringify(op.value)?.length>18000||
  JSON.stringify(op.value)?.includes('"__proto__"'))throw Error('共有データの形式が不正です。');
 return op;
}
export function diffSnapshots(old={},now={},kind,idFactory=()=>crypto.randomUUID()){
 return [...new Set([...Object.keys(old),...Object.keys(now)])]
  .filter(k=>!equals(old[k],now[k]))
  .map(key=>({id:idFactory(),at:Date.now(),kind,key,value:Object.hasOwn(now,key)?clone(now[key]):null}));
}
export function replayOps(before={},ops=[]){
 const result={...before},seen=new Set();
 for(const op of ops){if(seen.has(op.id))continue;seen.add(op.id);
  if(op.value===null)delete result[op.key];else result[op.key]=clone(op.value);}
 return result;
}
/**
 * Preserve Google's reason and the failed operation instead of treating every
 * HTTP 403 as disabled Sheets API. Google API errors can arise in either
 * Sheets or Drive, and the project in ErrorInfo often identifies a mismatch.
 */
export function describeSharedApiFailure(status,payload,host,path,method='GET'){
 const sheets=host.includes('sheets.googleapis.com');
 const service=sheets?'Google Sheets API':'Google Drive API';
 let stage=sheets?'共有データ読み取り':'共有ファイル操作';
 if(sheets&&method==='POST'&&/^\/spreadsheets(?:\?|$)/.test(path))stage='共有ファイルの作成';
 else if(sheets&&method==='POST'&&path.includes(':append'))stage='共有データの書き込み';
 else if(!sheets&&method==='POST'&&path.includes('/permissions'))stage='共有相手への編集権限の付与';
 const error=payload?.error&&typeof payload.error==='object'?payload.error:{};
 const details=Array.isArray(error.details)?error.details:[];
 const info=details.find(item=>item?.['@type']==='type.googleapis.com/google.rpc.ErrorInfo')||
  details.find(item=>typeof item?.reason==='string')||{};
 const reason=String(info.reason||error.status||'').slice(0,80);
 const consumer=String(info.metadata?.consumer||'');
 const project=/^projects\/([a-zA-Z0-9_-]{1,80})$/.exec(consumer)?.[1]||'';
 const message=String(error.message||'').replace(/\s+/g,' ').slice(0,400);
 let suggestion='';
 if(reason==='SERVICE_DISABLED'||reason==='accessNotConfigured')
  suggestion='エラーに示されたGoogle Cloudプロジェクトで対象APIを有効化してください。';
 else if(reason==='ACCESS_TOKEN_SCOPE_INSUFFICIENT'||reason==='insufficientPermissions')
  suggestion='共有用Google認証の権限が不足しています。再度「共有を開始」から認証してください。';
 else if(reason==='storageQuotaExceeded'||reason==='quotaExceeded'||reason==='RESOURCE_EXHAUSTED')
  suggestion='Google Driveの空き容量やAPI利用上限を確認してください。';
 else if(reason==='domainPolicy'||reason==='cannotShareAcrossDomains')
  suggestion='Google Workspaceの外部共有制限を確認してください。';
 return `${stage}に失敗しました（${service}／HTTP ${status}${reason?'／'+reason:''}${project?'／プロジェクト '+project:''}）。${suggestion}${message?' Google: '+message:''}`;
}

export class FamilyDriveClient{
 constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;this.token='';this.expires=0;this.clientId='';this.forceConsent=false;this.forceAccountChoice=false;}
 get connected(){return !!this.token&&Date.now()<this.expires;}
 invalidateAccess({consent=false}={}){
  this.token='';this.expires=0;this.forceConsent=consent;
  try{sessionStorage.removeItem(TOKEN_STORAGE);}catch{}
 }

 restore(clientId){
  let s;try{s=JSON.parse(sessionStorage.getItem(TOKEN_STORAGE)||'null');}catch{}
  if(!s||s.clientId!==clientId||!s.token||s.expires<=Date.now())return false;
  Object.assign(this,{token:s.token,expires:s.expires,clientId});return true;
 }
 chooseAccountAgain(clientId){
  forgetGoogleAccount(clientId,'share');
  this.invalidateAccess();
  this.forceAccountChoice=true;
 }
 authorize(clientId){
  if(this.connected&&this.clientId===clientId&&!this.forceAccountChoice)return Promise.resolve();
  if(!clientId||!globalThis.google?.accounts?.oauth2)throw Error('Google認証を準備してください。');
  return new Promise((resolve,reject)=>{
   google.accounts.oauth2.initTokenClient({
    client_id:clientId,scope:SHARE_SCOPE,
    ...(!this.forceAccountChoice&&preferredGoogleAccount(clientId,'share')?{login_hint:preferredGoogleAccount(clientId,'share')}:{}),
    callback:r=>{
     if(r.error||!r.access_token){reject(Error('共有用Google認証を許可してください。'));return;}
     if(!google.accounts.oauth2.hasGrantedAllScopes(r,SHARE_SCOPE)){reject(Error('Driveファイルの権限が必要です。'));return;}
     this.token=r.access_token;this.clientId=clientId;
     this.expires=Date.now()+Math.max(60,Number(r.expires_in||3600)-60)*1000;
     this.forceConsent=false;this.forceAccountChoice=false;
     void rememberDriveAccount(clientId,'share',this.token,this.fetcher);
     try{sessionStorage.setItem(TOKEN_STORAGE,JSON.stringify({token:this.token,clientId,expires:this.expires}));}catch{}
     resolve();
    },error_callback:r=>reject(Error(r?.type==='popup_closed'?'Google認証画面が閉じられました。':'Google認証を開けませんでした。'))
   }).requestAccessToken({prompt:this.forceAccountChoice?'select_account':this.forceConsent?'consent':''});
  });
 }
 async request(host,path,{method='GET',body}={}){
  if(!this.connected)throw Error('共有用Google認証の有効期限が切れました。共有ボタンから再認証してください。');
  let r;try{r=await this.fetcher(host+path,{method,headers:{Authorization:'Bearer '+this.token,
   ...(body!==undefined?{'Content-Type':'application/json'}:{})},
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});}
  catch{throw Error('Googleとの通信に失敗しました。');}
  if(r.status===401){
   this.invalidateAccess();
   throw Error('共有用Google認証の有効期限が切れました。');
  }
  if(!r.ok){
   let payload=null;
   try{payload=await r.json();}catch{}
   const reason=payload?.error?.details?.find(d=>d?.reason)?.reason||'';
   if(r.status===403&&(reason==='ACCESS_TOKEN_SCOPE_INSUFFICIENT'||reason==='insufficientPermissions'))
    this.invalidateAccess({consent:true});
   throw Error(describeSharedApiFailure(r.status,payload,host,path,method));
  }
  return r.status===204?null:r.json();
 }
 sheets(path,opt){return this.request('https://sheets.googleapis.com/v4',path,opt);}
 drive(path,opt){return this.request('https://www.googleapis.com',path,opt);}
 async create(type){
  if(!SHARED_KINDS.includes(type))throw Error('不明な共有対象です。');
  const r=await this.sheets('/spreadsheets',{method:'POST',body:{
   properties:{title:'KonDate 共有'+(type==='master'?'料理マスター':'買い物リスト')},
   sheets:[{properties:{title:'Ops',gridProperties:{columnCount:2,rowCount:1000}}}]
  }});
  if(!validId(r.spreadsheetId))throw Error('共有ファイルを作成できませんでした。');
  await this.appendRows(r.spreadsheetId,[[MARKER,type]]);
  return r.spreadsheetId;
 }
 async invite(id,email){
  if(!validId(id)||!/^[-\w.+]+@[-\w.]+\.[a-z]{2,}$/i.test(String(email)))throw Error('メールアドレスを確認してください。');
  return this.drive('/drive/v3/files/'+encodeURIComponent(id)+'/permissions?sendNotificationEmail=true',{
   method:'POST',body:{type:'user',role:'writer',emailAddress:email}
  });
 }
 appendRows(id,rows){
  if(!validId(id)||!Array.isArray(rows)||!rows.length||rows.length>300)throw Error('共有ファイルの書き込みが不正です。');
  return this.sheets('/spreadsheets/'+encodeURIComponent(id)+'/values/'+encodeURIComponent('Ops!A:B')+
   ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
   method:'POST',body:{majorDimension:'ROWS',values:rows}});
 }
 async readRows(id,start=1){
  if(!validId(id)||!Number.isInteger(start)||start<1)throw Error('共有ファイルのIDが不正です。');
  const r=await this.sheets('/spreadsheets/'+encodeURIComponent(id)+'/values/'+encodeURIComponent('Ops!A'+start+':B')+'?valueRenderOption=UNFORMATTED_VALUE');
  return Array.isArray(r.values)?r.values:[];
 }
 async pick(apiKey,projectNumber){
  if(!apiKey||!projectNumber)throw Error('参加するにはGoogle Picker APIキーとプロジェクト番号の設定が必要です。');
  if(!this.connected)throw Error('Google認証が必要です。');
  if(!globalThis.gapi?.load)throw Error('Google Pickerライブラリを読み込めませんでした。');
  await new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('Google Pickerを読み込めませんでした。'))}));
  const p=globalThis.google?.picker;
  if(!p)throw Error('Google Pickerを利用できません。');
  return new Promise((resolve,reject)=>{
   const view=new p.DocsView(p.ViewId.SPREADSHEETS).setMode(p.DocsViewMode.LIST);
   const picker=new p.PickerBuilder().addView(view).setOAuthToken(this.token)
    .setDeveloperKey(apiKey).setAppId(projectNumber).setOrigin(location.origin)
    .setCallback(r=>{
     if(r.action===p.Action.CANCEL)resolve(null);
     if(r.action===p.Action.PICKED){const id=r.docs?.[0]?.id;
      if(validId(id))resolve(id);else reject(Error('共有ファイルを選択できませんでした。'));}
    }).build();
   picker.setVisible(true);
  });
 }
}
export function readFamilySettings(storage=globalThis.localStorage){
 let d;try{d=JSON.parse(storage?.getItem(STORAGE)||'null');}catch{}
 d=d&&typeof d==='object'?d:{};
 const r={seconds:SHOPPING_SYNC_SECONDS.includes(Number(d.seconds))?Number(d.seconds):5};
 for(const type of SHARED_KINDS){
  const x=d[type]||{};r[type]={...blank(),id:validId(x.id)?x.id:'',owner:x.owner===true,
   cursor:Number.isInteger(x.cursor)&&x.cursor>=1?x.cursor:1,
   queue:Array.isArray(x.queue)?x.queue.filter(op=>{try{validateSharedOp(op,type);return true;}catch{return false;}}).slice(0,500):[],
   shadow:x.shadow&&typeof x.shadow==='object'&&!Array.isArray(x.shadow)?x.shadow:{},
   seen:Array.isArray(x.seen)?x.seen.slice(-1500):[]};
 }
 return r;
}
export class FamilySync{
 constructor(client,storage=globalThis.localStorage){this.client=client;this.storage=storage;this.settings=readFamilySettings(storage);this.busy={master:false,shopping:false};}
 persist(){this.storage?.setItem(STORAGE,JSON.stringify(this.settings));}
 entry(type){if(!SHARED_KINDS.includes(type))throw Error('共有対象が不正です。');return this.settings[type];}
 observe(type,current){
  const d=this.entry(type);if(!d.id)return 0;
  const added=diffSnapshots(d.shadow,current,type);
  if(!added.length)return 0;
  if(d.queue.length+added.length>500)throw Error('共有操作の未送信件数が上限です。');
  d.queue.push(...added);d.shadow=clone(current);this.persist();return added.length;
 }
 async start(type,current,email){
  if(!this.client.connected)throw Error('共有用Google認証が必要です。');
  if(this.entry(type).id)throw Error('すでに共有中です。');
  const id=await this.client.create(type);
  const ops=diffSnapshots({},current,type);
  for(let i=0;i<ops.length;i+=200)await this.client.appendRows(id,ops.slice(i,i+200).map(op=>[op.id,JSON.stringify(op)]));
  // Keep the link if invitation fails, so the initial data is not abandoned.
  this.settings[type]={...blank(),id,owner:true,cursor:2+ops.length,shadow:clone(current),seen:ops.map(op=>op.id).slice(-1500)};
  this.persist();
  if(email)await this.client.invite(id,email);
  return id;
 }
 async join(type,id,apply){
  if(!this.client.connected)throw Error('共有用Google認証が必要です。');
  const rows=await this.client.readRows(id,1);
  if(rows[0]?.[0]!==MARKER||rows[0]?.[1]!==type)throw Error('このファイルはKonDateの該当する共有データではありません。');
  const ops=[];
  for(const row of rows.slice(1)){if(!row?.[1])continue;ops.push(validateSharedOp(JSON.parse(row[1]),type));}
  await apply(ops,{initial:true});
  this.settings[type]={...blank(),id,cursor:rows.length+1,shadow:replayOps({},ops),
   seen:ops.map(op=>op.id).slice(-1500)};
  this.persist();return id;
 }
 stop(type){this.settings[type]=blank();this.persist();}
 async sync(type,apply){
  const d=this.entry(type);
  if(!d.id||this.busy[type]||!this.client.connected)return {changed:false,conflicts:[]};
  this.busy[type]=true;
  try{
   const rows=await this.client.readRows(d.id,d.cursor);
   const known=new Set(d.seen),remote=[],conflicts=[];
   for(const row of rows){if(!row?.[1])continue;
    const op=validateSharedOp(JSON.parse(row[1]),type);
    if(known.has(op.id))continue;
    remote.push(op);known.add(op.id);
    // An echoed or independently identical edit is not a conflict. Compare
    // the latest locally pending value, not just the shared recipe key.
    const pending=d.queue.filter(x=>x.id!==op.id&&x.key===op.key).at(-1);
    if(pending&&!equals(pending.value,op.value))conflicts.push(op.key);
   }
   d.cursor+=rows.length;d.seen=[...known].slice(-1500);
   const acknowledged=new Set(remote.map(op=>op.id));
   d.queue=d.queue.filter(op=>!acknowledged.has(op.id));
   const pendingKeys=new Set(d.queue.map(op=>op.key));
   const accepted=remote.filter(op=>!pendingKeys.has(op.key));
   if(accepted.length)await apply(accepted,{initial:false});
   d.shadow=replayOps(d.shadow,remote);
   d.shadow=replayOps(d.shadow,d.queue);
   this.persist();
   if(d.queue.length){const outgoing=d.queue.slice(0,120);
    await this.client.appendRows(d.id,outgoing.map(op=>[op.id,JSON.stringify(op)]));
    // Confirm each operation ID via a later read before acknowledging it.
   }
   return {changed:accepted.length>0,conflicts:[...new Set(conflicts)],pending:d.queue.length};
  }finally{this.busy[type]=false;this.persist();}
 }
}
