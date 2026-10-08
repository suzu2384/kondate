// Google Drive AppDataFolder backup. Drive access is requested only on user action.
const ROOT='https://www.googleapis.com';
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const FILE='kondate-settings.json';
export class DriveSettingsClient{
 constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;this.token='';this.expires=0;this.clientId='';}
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
     this.token=result.access_token;this.expires=Date.now()+(Number(result.expires_in)-60)*1000;this.clientId=clientId;resolve();
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
  if(response.status===401){this.token='';throw Error('Googleドライブの認証期限が切れました。再度お試しください。');}
  if(!response.ok)throw Error(response.status===403?'Drive APIが無効か、保存権限がありません。Google CloudでDrive APIを有効にしてください。':`Drive APIでエラーが発生しました（${response.status}）。`);
  return response.status===204?null:response.json();
 }
 async find(){
  const query=new URLSearchParams({spaces:'appDataFolder',q:`name = '${FILE}' and trashed = false`,fields:'files(id,name),nextPageToken',pageSize:'100'});
  const result=await this.request('/drive/v3/files?'+query);
  return result.files?.find(f=>f.name===FILE)||null;
 }
 async save(value){
  let file=await this.find();
  if(!file){
   file=await this.request('/drive/v3/files?fields=id',{method:'POST',contentType:'application/json',body:JSON.stringify({name:FILE,mimeType:'application/json',parents:['appDataFolder']})});
  }
  if(!file?.id)throw Error('Googleドライブに保存先を作成できませんでした。');
  await this.request('/upload/drive/v3/files/'+encodeURIComponent(file.id)+'?uploadType=media',{method:'PATCH',contentType:'application/json',body:JSON.stringify(value)});
 }
 async load(){
  const file=await this.find();
  if(!file)throw Error('保存済みの献立ノート設定が見つかりません。');
  return this.request('/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media');
 }
}
