import {createMenuRequest,parseMenuResponse} from './ai-menu.js';

// Google-hosted Firebase SDK: loaded only after a person chooses AI generation.
const FIREBASE_CDN='https://www.gstatic.com/firebasejs/12.19.0/';
async function loadFirebaseSDK(){
 const [app,appCheck,ai]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js')
 ]);
 return {app,appCheck,ai};
}
const COUNTER_KEY='kondate.ai-shared-usage.v1';
export function checkDeviceLimit(storage,max=3,now=new Date()){
 const day=now.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
 let record;
 try{record=JSON.parse(storage?.getItem(COUNTER_KEY)||'null');}catch{}
 const count=record?.day===day&&Number.isInteger(record.count)?record.count:0;
 if(count>=max)throw Error('この端末でのAI献立生成は本日分の上限に達しました。通常の献立生成をご利用ください。');
 try{storage?.setItem(COUNTER_KEY,JSON.stringify({day,count:count+1}));}catch{}
}

/**
 * Public shared Firebase project only. App Check is mandatory.
 * Browser-side request limits are only a UX safeguard; configure per-user
 * quotas, App Check enforcement and no-billing Spark mode on Google Console.
 */
export function createFirebaseAIProvider(config,{loadSDK=loadFirebaseSDK,storage=globalThis.localStorage}={}){
 let modelPromise;
 async function getModel(){
  if(!modelPromise)modelPromise=(async()=>{
   const {app,appCheck,ai}=await loadSDK();
   const firebase=app.initializeApp(config.firebase,'kondate-ai-shared');
   const check=appCheck.initializeAppCheck(firebase,{
    provider:new appCheck.ReCaptchaEnterpriseProvider(config.appCheckSiteKey),
    isTokenAutoRefreshEnabled:true
   });
   // Check actual attestation before sending any AI request.
   await appCheck.getToken(check);
   const service=ai.getAI(firebase,{backend:new ai.GoogleAIBackend()});
   return ai.getGenerativeModel(service,{
    model:config.model,
    generationConfig:{responseMimeType:'application/json',temperature:0.6}
   });
  })().catch(error=>{modelPromise=null;throw error;});
  return modelPromise;
 }
 return {
  kind:'shared-firebase',
  async generate(context){
   const {prompt}=createMenuRequest(context);
   const model=await getModel();
   checkDeviceLimit(storage,Math.max(1,Math.min(10,Number(config.maxPerDevicePerDay)||3)));
   let text;
   try{
    const result=await model.generateContent(prompt);
    text=result?.response?.text();
   }catch(error){
    const details=String(error?.message||'');
    if(/429|quota|RESOURCE_EXHAUSTED|rate.limit/i.test(details))
     throw Error('AIの無料利用枠または回数制限に達しました。通常の献立生成をご利用ください。');
    if(/app.check|recaptcha|permission.denied|403/i.test(details))
     throw Error('AIの不正利用防止認証に失敗しました。通信環境を確認してください。');
    throw Error('AIから献立を取得できませんでした。通常の献立生成をご利用ください。');
   }
   return parseMenuResponse(text,context);
  }
 };
}
