// Google Drive AppDataFolder backup. Drive access is requested only on user action.
const ROOT='https://www.googleapis.com';
export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata';
const SCOPE=DRIVE_SCOPE;
const FILE='kondate-settings.json';
const AUTO_KEY='kondate.drive-autosync.v1';
const TOKEN_KEY='kondate.drive-autosync-token.v1';
export class DriveSettingsClient{
 constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;this.token='';this.expires=0;this.clientId='';}
 get connected(){return !!this.token&&Date.now()<this.expires;}
 get autoEnabled(){
  try{return globalThis.localStorage?.getItem(AUTO_KEY)==='1';}catch{return false;}
 }
 get reauthRequired(){return this.autoEnabled&&!this.connected;}
 saveAutoToken(){
  if(!this.autoEnabled||!this.connected)return;
  try{globalThis.localStorage?.setItem(TOKEN_KEY,JSON.stringify({clientId:this.clientId,token:this.token,expires:this.expires}));}catch{}
 }
 enableAuto(){
  if(!this.connected)throw Error('Driveの認証後に自動同期を有効にしてください。');
  try{
   if(!globalThis.localStorage)throw Error('Storage unavailable');
   globalThis.localStorage.setItem(AUTO_KEY,'1');
   this.saveAutoToken();
  }catch{throw Error('端末にDrive同期の設定を保存できませんでした。');}
 }
 disableAuto(){
  try{globalThis.localStorage?.removeItem(AUTO_KEY);globalThis.localStorage?.removeItem(TOKEN_KEY);}catch{}
 }
 forgetToken(){
  this.token='';this.expires=0;
  try{globalThis.localStorage?.removeItem(TOKEN_KEY);}catch{}
 }
 restoreAuto(clientId){
  if(!this.autoEnabled||!clientId)return false;
  let record;
  try{record=JSON.parse(globalThis.localStorage?.getItem(TOKEN_KEY)||'null');}catch{}
  if(!record||record.clientId!==clientId||typeof record.token!=='string'||
   !record.token||!Number.isFinite(record.expires)||record.expires<=Date.now()||
   record.expires>Date.now()+24*60*60*1000){this.forgetToken();return false;}
  this.clientId=clientId;this.token=record.token;this.expires=record.expires;
  return true;
 }
 async authorize(clientId){
  if(!clientId?.endsWith('.apps.googleusercontent.com'))throw Error('Google OAuthクライアントIDを先に設定してください。');
  if(this.token&&Date.now()<this.expires&&this.clientId===clientId)return;
  if(!globalThis.google?.accounts?.oauth2)throw Error('Googleログインを準備できません。設定画面を再表示してください。');
  return new Promise((resolve,reject)=>{
   const client=google.accounts.oauth2.initTokenClient({
    client_id:clientId,scope:SCOPE,
    callback:result=>{
     if(result.error){reject(Error('Googleドライブへのアクセスが許可されませんでした。'));return;}
     if(!google.accounts.oauth2.hasGrantedAllScopes(result,SCOPE)){reject(Error('アプリデータの読み書き権限が必要です。'));return;}
     this.token=result.access_token;this.expires=Date.now()+(Number(result.expires_in)-60)*1000;this.clientId=clientId;this.saveAutoToken();resolve();
    },
    error_callback:result=>reject(Error(result.type==='popup_closed'?'認証画面が閉じられました。':'Google認証画面を開けませんでした。'))
   });
   client.requestAccessToken({prompt:''});
  });
 }
 async request(path,{method='GET',body,contentType}={}){
  if(!this.token||Date.now()>=this.expires)throw Error('Googleドライブへの再認証が必要です。');
  let response;
  try{response=await this.fetcher(ROOT+path,{method,headers:{Authorization:'Bearer '+this.token,...(contentType?{'Content-Type':contentType}:{})},body,signal:AbortSignal.timeout(25000)});}
  catch{throw Error('Googleドライブとの通信に失敗しました。通信状況をご確認ください。');}
  if(response.status===401){this.forgetToken();throw Error('Googleドライブの認証期限が切れました。再度お試しください。');}
  if(!response.ok)throw Error(response.status===403?'Drive APIが無効か、保存権限がありません。Google CloudでDrive APIを有効にしてください。':`Drive APIでエラーが発生しました（${response.status}）。`);
  return response.status===204?null:response.json();
 }
 async find(){
  let pageToken='';
  do{
   const query=new URLSearchParams({spaces:'appDataFolder',q:`name = '${FILE}' and trashed = false`,fields:'files(id,name,modifiedTime,version),nextPageToken',pageSize:'100'});
   if(pageToken)query.set('pageToken',pageToken);
   const result=await this.request('/drive/v3/files?'+query);
   const found=result.files?.find(f=>f.name===FILE);
   if(found)return found;
   pageToken=result.nextPageToken||'';
  }while(pageToken);
  return null;
 }
 async save(value){
  let file=await this.find();
  if(!file){
   file=await this.request('/drive/v3/files?fields=id',{method:'POST',contentType:'application/json',body:JSON.stringify({name:FILE,mimeType:'application/json',parents:['appDataFolder']})});
  }
  if(!file?.id)throw Error('Googleドライブに保存先を作成できませんでした。');
  return this.request('/upload/drive/v3/files/'+encodeURIComponent(file.id)+'?uploadType=media&fields=id,version,modifiedTime',{method:'PATCH',contentType:'application/json',body:JSON.stringify(value)});
 }
 async load(fileId=null){
  const file=fileId?{id:fileId}:await this.find();
  if(!file)throw Error('保存済みの献立ノート設定が見つかりません。');
  return this.request('/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media');
 }
 async saveChecked(value,expectedVersion){
  const file=await this.find();
  if(String(file?.version||'')!==String(expectedVersion||''))
   throw Error('Drive上の設定が変更されています。同期状態を再確認してください。');
  // Prefer the upload response version: a subsequent file-list request can
  // temporarily return old metadata for our own successful write.
  if(!file){
   const created=await this.save(value);
   return String(created?.version||(await this.find())?.version||'');
  }
  const updated=await this.request('/upload/drive/v3/files/'+encodeURIComponent(file.id)+'?uploadType=media&fields=id,version,modifiedTime',{method:'PATCH',contentType:'application/json',body:JSON.stringify(value)});
  return String(updated?.version||(await this.find())?.version||'');
 }

}
