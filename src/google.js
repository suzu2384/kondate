import {eventPayload} from './model.js';
const ROOT='https://www.googleapis.com/calendar/v3';
export const SCOPES='https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events';
export class CalendarClient {
 constructor(fetcher=fetch){this.fetcher=fetcher;this.token=null;this.expires=0;this.clientId='';}
 get connected(){return !!this.token&&Date.now()<this.expires;}
 async loadIdentity(){if(globalThis.google?.accounts?.oauth2)return;await new Promise((resolve,reject)=>{let script=document.querySelector('#google-identity');if(script)script.remove();script=document.createElement('script');script.id='google-identity';script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>reject(Error('Google認証を読み込めません。接続を確認してください。'));document.head.append(script);});}
 authorize(clientId){if(!clientId) return Promise.reject(Error('設定でGoogle OAuthクライアントIDを入力してください。'));if(!globalThis.google?.accounts?.oauth2)return Promise.reject(Error('認証を準備中です。少し待ってもう一度接続してください。'));this.clientId=clientId;return new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPES,callback:r=>{if(r.error){reject(Error('Googleへの接続が許可されませんでした。'));return;}if(!google.accounts.oauth2.hasGrantedAllScopes(r,...SCOPES.split(' '))){reject(Error('カレンダーの読み書き権限をすべて許可してください。'));return;}this.token=r.access_token;this.expires=Date.now()+(Number(r.expires_in)-60)*1000;resolve();},error_callback:r=>reject(Error(r.type==='popup_closed'?'認証画面が閉じられました。':'ポップアップを許可して再接続してください。'))});client.requestAccessToken({prompt:''});});}
 disconnect(){this.token=null;this.expires=0;}
 async request(path,{method='GET',body,etag}={}){
  if(!this.connected){this.disconnect();throw Error('Googleへの再接続が必要です。入力内容は端末に残っています。');}
  const headers={Authorization:`Bearer ${this.token}`};if(body)headers['Content-Type']='application/json';if(etag)headers['If-Match']=etag;
  let response;try{response=await this.fetcher(ROOT+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});}catch{throw Error('通信に失敗しました。入力内容は保持されています。接続を確認して再試行してください。');}
  if(response.status===401){this.disconnect();throw Error('認証の有効期限が切れました。Googleへ再接続してください。');}
  if(response.status===412)throw Error('他の端末で変更されています。同期して最新の内容を確認してください。入力は残しています。');
  if(!response.ok){const err=new Error(response.status===403?'権限がないか、APIが未設定／利用上限です。Google設定を確認してください。':response.status===429?'アクセスが集中しています。少し待って再試行してください。':`Googleカレンダーとの通信に失敗しました（${response.status}）。`);err.status=response.status;throw err;}
  return response.status===204?null:response.json();
 }
 async calendars(){let list=[],pageToken;do{const q=new URLSearchParams({maxResults:'250'});if(pageToken)q.set('pageToken',pageToken);const r=await this.request('/users/me/calendarList?'+q);list.push(...r.items||[]);pageToken=r.nextPageToken;}while(pageToken);return list;}
 path(calendarId,id=''){return `/calendars/${encodeURIComponent(calendarId)}/events${id?'/'+encodeURIComponent(id):''}`;}
 async events(calendarId,from,to){let items=[],pageToken;do{const q=new URLSearchParams({timeMin:`${from}T00:00:00+09:00`,timeMax:`${to}T00:00:00+09:00`,singleEvents:'true',maxResults:'2500',orderBy:'startTime'});if(pageToken)q.set('pageToken',pageToken);const r=await this.request(this.path(calendarId)+'?'+q);items.push(...r.items||[]);pageToken=r.nextPageToken;}while(pageToken);return items;}
 async insert(calendarId,record){const payload={...eventPayload(record),id:record.id};try{return await this.request(this.path(calendarId),{method:'POST',body:payload});}catch(error){if(error.status===409){const found=await this.request(this.path(calendarId,record.id));if(found.extendedProperties?.private?.kondate==='1'&&found.description===payload.description&&found.start?.date===payload.start.date)return found;throw Error('同じ登録IDの内容が異なります。同期して確認してください。');}throw error;}}
 update(calendarId,record){if(!record.owned||!record.etag)throw Error('既存の外部予定は直接変更できません。');return this.request(this.path(calendarId,record.id),{method:'PATCH',body:eventPayload(record),etag:record.etag});}
 remove(calendarId,record){if(!record.owned||!record.etag)throw Error('既存の外部予定は削除できません。');return this.request(this.path(calendarId,record.id),{method:'DELETE',etag:record.etag});}
}
