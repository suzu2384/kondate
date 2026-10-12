// Non-secret account preference. Never save OAuth tokens here.
const KEY='kondate.google-account-hints.v1';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SERVICES=new Set(['calendar','drive','share']);
function record(clientId,storage){
 if(!clientId||!storage)return {};
 try{
  const value=JSON.parse(storage.getItem(KEY)||'null');
  return value?.clientId===clientId&&value.hints&&typeof value.hints==='object'?value.hints:{};
 }catch{return {};}
}
export function preferredGoogleAccount(clientId,service,storage=globalThis.localStorage){
 if(!SERVICES.has(service))return '';
 const hints=record(clientId,storage);
 // Use the last account of this service first. New services inherit the
 // Calendar account if possible, but can subsequently choose a different one.
 return [hints[service],hints.calendar,hints.drive,hints.share]
  .find(x=>typeof x==='string'&&EMAIL.test(x))||'';
}
export function rememberGoogleAccount(clientId,service,email,storage=globalThis.localStorage){
 if(!clientId||!SERVICES.has(service)||typeof email!=='string'||!EMAIL.test(email)||email.length>254)return false;
 try{
  if(!storage)return false;
  const hints=record(clientId,storage);
  hints[service]=email;
  storage.setItem(KEY,JSON.stringify({clientId,hints}));
  return true;
 }catch{return false;}
}
export function forgetGoogleAccount(clientId,service,storage=globalThis.localStorage){
 if(!clientId||!SERVICES.has(service))return;
 try{
  const hints=record(clientId,storage);
  delete hints[service];
  if(Object.keys(hints).length)storage?.setItem(KEY,JSON.stringify({clientId,hints}));
  else storage?.removeItem(KEY);
 }catch{}
}
export function rememberCalendarAccount(clientId,calendars,storage=globalThis.localStorage){
 const primary=Array.isArray(calendars)?calendars.find(c=>c?.primary===true):null;
 return rememberGoogleAccount(clientId,'calendar',primary?.id,storage);
}
// Both drive.appdata and drive.file authorize Drive about.get. A lookup
// failure is never allowed to block a successful OAuth authorization.
export async function rememberDriveAccount(clientId,service,token,fetcher=globalThis.fetch,storage=globalThis.localStorage){
 if(!clientId||!SERVICES.has(service)||!token||typeof fetcher!=='function')return false;
 try{
  const response=await fetcher('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',{
   headers:{Authorization:'Bearer '+token},
   signal:typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(10000):undefined
  });
  if(!response.ok)return false;
  const body=await response.json();
  return rememberGoogleAccount(clientId,service,body?.user?.emailAddress,storage);
 }catch{return false;}
}
