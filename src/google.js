import {eventPayload} from './model.js';
import {presetEventPayload} from './icon-presets.js';
const ROOT='https://www.googleapis.com/calendar/v3';
const SESSION_KEY='kondate.google-calendar-session.v1';
const KEEP_KEY='kondate.google-calendar-keep-connected.v1';
const PERSIST_KEY='kondate.google-calendar-token.v1';
export const SCOPES='https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events';
export class CalendarClient {
 constructor(fetcher=(...args)=>globalThis.fetch(...args)){this.fetcher=fetcher;this.token=null;this.expires=0;this.clientId='';this.identityLoading=null;this.needsReauth=false;}
 get connected(){return !!this.token&&Date.now()<this.expires;}
 get reauthenticationRequired(){return this.needsReauth||Boolean(this.token&&Date.now()>=this.expires);}
 get keepConnected(){
  try{return globalThis.localStorage?.getItem(KEEP_KEY)==='1';}catch{return false;}
 }
 tokenRecord(){return {clientId:this.clientId,token:this.token,expires:this.expires};}
 // Persist access tokens only with an explicit opt-in by the device's user.
 setKeepConnected(enabled){
  if(!enabled){
   try{globalThis.localStorage?.removeItem(KEEP_KEY);}catch{}
   this.forgetPersistentToken();
   return;
  }
  try{
   if(!globalThis.localStorage)throw Error('Storage unavailable');
   globalThis.localStorage.setItem(KEEP_KEY,'1');
   if(this.connected)globalThis.localStorage.setItem(PERSIST_KEY,JSON.stringify(this.tokenRecord()));
  }catch{
   try{globalThis.localStorage?.removeItem(KEEP_KEY);}catch{}
   this.forgetPersistentToken();
   throw Error('この端末で接続を保持できません。プライベートブラウズやブラウザの保存設定を確認してください。');
  }
 }
 forgetPersistentToken(){try{globalThis.localStorage?.removeItem(PERSIST_KEY);}catch{}}
 rememberSession(){
  if(!this.connected)return;
  const record=JSON.stringify(this.tokenRecord());
  try{globalThis.sessionStorage?.setItem(SESSION_KEY,record);}catch{}
  if(this.keepConnected){
   try{globalThis.localStorage?.setItem(PERSIST_KEY,record);}catch{}
  }else this.forgetPersistentToken();
  this.needsReauth=false;
 }
 forgetSession(){
  try{globalThis.sessionStorage?.removeItem(SESSION_KEY);}catch{}
  this.forgetPersistentToken();
 }
 clearToken(requiresLogin=false){
  this.token=null;this.expires=0;this.needsReauth=requiresLogin;this.forgetSession();
 }
 // A deliberate sign-out opts out of auto-login on this device.
 disconnect(){this.clearToken();this.setKeepConnected(false);}
 restoreSession(clientId){
  if(!clientId)return false;
  const parseValid=raw=>{
   if(!raw)return null;
   try{
    const saved=JSON.parse(raw);
    if(saved.clientId!==clientId||typeof saved.token!=='string'||!saved.token||
       !Number.isFinite(saved.expires)||saved.expires<=Date.now()||
       saved.expires>Date.now()+24*60*60*1000)return null;
    return saved;
   }catch{return null;}
  };
  let sessionRaw;
  try{sessionRaw=globalThis.sessionStorage?.getItem(SESSION_KEY);}catch{}
  let selected=parseValid(sessionRaw),persistentRaw;
  if(!selected){
   try{globalThis.sessionStorage?.removeItem(SESSION_KEY);}catch{}
   if(this.keepConnected){
    try{persistentRaw=globalThis.localStorage?.getItem(PERSIST_KEY);}catch{}
    selected=parseValid(persistentRaw);
    if(!selected)this.forgetPersistentToken();
   }else this.forgetPersistentToken();
  }
  if(!selected){
   this.needsReauth=Boolean(sessionRaw||persistentRaw);
   return false;
  }
  this.clientId=clientId;this.token=selected.token;this.expires=selected.expires;
  this.rememberSession();
  return true;
 }
 async loadIdentity(){
  if(globalThis.google?.accounts?.oauth2)return;
  if(this.identityLoading)return this.identityLoading;
  this.identityLoading=new Promise((resolve,reject)=>{
   const prior=document.querySelector('#google-identity');if(prior)prior.remove();
   const script=document.createElement('script');
   script.id='google-identity';
   script.src='https://accounts.google.com/gsi/client';
   script.async=true;
   script.onload=()=>globalThis.google?.accounts?.oauth2?resolve():reject(Error('Google認証ライブラリを初期化できませんでした。'));
   script.onerror=()=>reject(Error('Google認証を読み込めません。ブラウザの広告ブロック・通信制限などを確認してください。'));
   document.head.append(script);
  }).finally(()=>{this.identityLoading=null;});
  return this.identityLoading;
 }
 authorize(clientId){if(!clientId) return Promise.reject(Error('アプリのGoogle認証設定が完了していません。'));if(!globalThis.google?.accounts?.oauth2)return Promise.reject(Error('認証を準備中です。少し待ってもう一度接続してください。'));this.clientId=clientId;return new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPES,callback:r=>{if(r.error){reject(Error(`Google認証が完了しませんでした（${String(r.error)}）。Google CloudのクライアントID・テストユーザー・認証設定を確認してください。`));return;}if(!google.accounts.oauth2.hasGrantedAllScopes(r,...SCOPES.split(' '))){reject(Error('カレンダーの読み書き権限をすべて許可してください。'));return;}this.token=r.access_token;this.expires=Date.now()+(Number(r.expires_in)-60)*1000;this.rememberSession();resolve();},error_callback:r=>reject(Error(r.type==='popup_closed'?'認証画面が閉じられました。':'ポップアップを許可して再接続してください。'))});client.requestAccessToken({prompt:''});});}
 async request(path,{method='GET',body,etag}={}){
  if(!this.connected){this.clearToken(true);throw Error('Googleへの再接続が必要です。再ログインしてください。');}
  const headers={Authorization:`Bearer ${this.token}`};if(body)headers['Content-Type']='application/json';if(etag)headers['If-Match']=etag;
  let response;
  try{
   const signal=typeof AbortSignal.timeout==='function'?AbortSignal.timeout(25000):undefined;
   response=await this.fetcher(ROOT+path,{method,headers,body:body?JSON.stringify(body):undefined,...(signal?{signal}:{})});
  }catch(error){
   const name=String(error?.name||'Error');
   const detail=String(error?.message||'詳細なし').slice(0,120);
   if(name==='TimeoutError'||name==='AbortError')
    throw Error('Googleカレンダーへの通信が25秒以内に完了しませんでした（'+name+'）。回線やVPNを確認して再試行してください。入力内容は保持されています。');
   if(name==='TypeError'&&/Failed to fetch|Load failed|NetworkError/i.test(detail))
    throw Error('ブラウザがGoogle Calendar APIへの通信を完了できませんでした（'+name+': '+detail+'）。F12の「ネットワーク」でcalendarListへのアクセスがCORSエラー・ブロック・接続失敗になっていないか確認してください。入力内容は保持されています。');
   throw Error('Googleカレンダーへの通信処理でエラーが発生しました（'+name+': '+detail+'）。入力内容は保持されています。');
  }
  if(response.status===401){this.clearToken(true);throw Error('認証の有効期限が切れました。Googleへ再接続してください。');}
  if(response.status===412)throw Error('他の端末で変更されています。同期して最新の内容を確認してください。入力は残しています。');
  if(!response.ok){
   let details;
   try{details=await response.clone().json();}catch{}
   const reason=[details?.error?.errors?.[0]?.reason,...(details?.error?.details||[]).map(d=>d.reason),details?.error?.status].filter(Boolean).join(', ');
   const message=String(details?.error?.message||'');
   const hint=response.status===403?(
    /accessNotConfigured|SERVICE_DISABLED|API has not been used|API is disabled|it is disabled/i.test(reason+' '+message)?'Google CloudでCalendar APIを有効にしてください。':
    /insufficientPermissions|insufficientAuthenticationScopes|PERMISSION_DENIED/i.test(reason)?'カレンダー権限またはGoogle認証時の許可範囲を確認してください。':
    'Google CloudのAPI有効化・アクセス権・利用上限を確認してください。'
   ):response.status===404?'選択したカレンダーが見つかりません。設定で保存先を確認してください。':
   response.status===429?'APIの利用が集中しています。少し待ってから再試行してください。':
   'Googleカレンダーとの通信に失敗しました。';
   const err=new Error(`${hint}（HTTP ${response.status}${reason?', '+reason:''}）`);
   err.status=response.status;throw err;
  }
  return response.status===204?null:response.json();
 }
 async calendars(){let list=[],pageToken;do{const q=new URLSearchParams({maxResults:'250'});if(pageToken)q.set('pageToken',pageToken);const r=await this.request('/users/me/calendarList?'+q);list.push(...r.items||[]);pageToken=r.nextPageToken;}while(pageToken);return list;}
 path(calendarId,id=''){return `/calendars/${encodeURIComponent(calendarId)}/events${id?'/'+encodeURIComponent(id):''}`;}
 async events(calendarId,from,to){let items=[],pageToken;do{const q=new URLSearchParams({timeMin:`${from}T00:00:00+09:00`,timeMax:`${to}T00:00:00+09:00`,singleEvents:'true',maxResults:'2500',orderBy:'startTime'});if(pageToken)q.set('pageToken',pageToken);const r=await this.request(this.path(calendarId)+'?'+q);items.push(...r.items||[]);pageToken=r.nextPageToken;}while(pageToken);return items;}
 async insert(calendarId,record){const payload={...eventPayload(record),id:record.id};try{return await this.request(this.path(calendarId),{method:'POST',body:payload});}catch(error){if(error.status===409){const found=await this.request(this.path(calendarId,record.id));if(found.extendedProperties?.private?.kondate==='1'&&found.description===payload.description&&found.start?.date===payload.start.date&&String(found.location||'')===payload.location)return found;throw Error('同じ登録IDの内容が異なります。同期して確認してください。');}throw error;}}
 async insertPreset(calendarId,date,rule,id){
  const payload={...presetEventPayload(date,rule),id};
  try{return await this.request(this.path(calendarId),{method:'POST',body:payload});}
  catch(error){
   if(error.status===409){
    const found=await this.request(this.path(calendarId,id));
    if(found.summary===payload.summary&&String(found.description||'')===payload.description&&found.start?.date===date&&
       found.extendedProperties?.private?.kondatePresetId===String(rule.id))return found;
   }
   throw error;
  }
 }
 removePreset(calendarId,event){return this.request(this.path(calendarId,event.id),{method:'DELETE',etag:event.etag});}
 update(calendarId,record){
  if(!record.etag)throw Error('予定の更新情報がありません。カレンダーを同期してから編集してください。');
  const payload=eventPayload(record);
  // Existing Google events are edited in place; retain original dates, times,
  // attendees and other unrelated fields while storing the confirmed dish data.
  const body=record.owned?payload:{
   summary:payload.summary,description:payload.description,location:payload.location,
   extendedProperties:{private:{...record.raw?.extendedProperties?.private,kondate:'1',state:'actual'}}
  };
  return this.request(this.path(calendarId,record.id),{method:'PATCH',body,etag:record.etag});
 }
 remove(calendarId,record){if(!record.etag)throw Error('予定の削除情報がありません。カレンダーを同期してから削除してください。');return this.request(this.path(calendarId,record.id),{method:'DELETE',etag:record.etag});}
}
