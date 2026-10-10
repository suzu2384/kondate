import {SCOPES} from './google.js';
import {DRIVE_SCOPE} from './drive.js';

// A service is renewed only when its previous authorization has expired.
// Drive without auto sync is included only if it was authorized in this session.
export function expiredGoogleServices(calendar,drive){
 return {
  calendar:!calendar.connected&&calendar.reauthenticationRequired,
  drive:!drive.connected&&(drive.autoEnabled||Boolean(drive.token))
 };
}
export function expiredGoogleScopes(services){
 const scopes=[];
 if(services.calendar)scopes.push(...SCOPES.split(' '));
 if(services.drive)scopes.push(DRIVE_SCOPE);
 return scopes;
}
export function renewExpiredGoogleServices(calendar,drive,clientId,services=expiredGoogleServices(calendar,drive)){
 const refresh={calendar:!!services.calendar,drive:!!services.drive};
 const scopes=expiredGoogleScopes(refresh);
 if(!scopes.length)return Promise.resolve(refresh);
 if(!clientId||!clientId.endsWith('.apps.googleusercontent.com'))
  return Promise.reject(Error('Googleの認証設定が完了していません。'));
 const oauth=globalThis.google?.accounts?.oauth2;
 if(!oauth)return Promise.reject(Error('Google認証を読み込んでいます。準備完了後に再試行してください。'));
 return new Promise((resolve,reject)=>{
  const client=oauth.initTokenClient({
   client_id:clientId,scope:scopes.join(' '),
   callback:result=>{
    if(result.error){reject(Error('Googleの再認証が完了しませんでした（'+String(result.error)+'）。'));return;}
    if(!result.access_token||!oauth.hasGrantedAllScopes(result,...scopes)){
     reject(Error('再認証するサービスの権限をすべて許可してください。'));return;
    }
    const expires=Date.now()+Math.max(0,Number(result.expires_in||0)-60)*1000;
    if(expires<=Date.now()){reject(Error('Googleから有効な認証情報を取得できませんでした。'));return;}
    // Both services receive the same token only when both scopes were requested.
    // Never replace a service that is still connected.
    if(refresh.calendar){
     calendar.clientId=clientId;calendar.token=result.access_token;calendar.expires=expires;
     calendar.rememberSession();
    }
    if(refresh.drive){
     drive.clientId=clientId;drive.token=result.access_token;drive.expires=expires;
     drive.saveAutoToken();
    }
    resolve(refresh);
   },
   error_callback:result=>reject(Error(result.type==='popup_closed'?'Googleの再認証画面が閉じられました。':'Googleの再認証画面を開けませんでした。ポップアップを許可してください。'))
  });
  // Must be invoked within the synchronous part of the actual user click.
  client.requestAccessToken({prompt:''});
 });
}
