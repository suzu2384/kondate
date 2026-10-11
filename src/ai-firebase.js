import {createMenuRequest,parseMenuResponse} from './ai-menu.js';

// Google-hosted Firebase SDK: loaded only after a person chooses AI generation.
async function loadFirebaseSDK(){
 const [app,appCheck,ai]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js'),
  import('https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js')
 ]);
 return {app,appCheck,ai};
}
/**
 * Public shared Firebase project only. App Check is mandatory.
 * No per-device request counter: provider-side free-tier quotas
 * and the owner's no-billing Spark configuration remain in effect.
 */
export function createFirebaseAIProvider(config,{loadSDK=loadFirebaseSDK}={}){
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
    generationConfig:{responseMimeType:'application/json'}
   });
  })().catch(error=>{modelPromise=null;throw error;});
  return modelPromise;
 }
 return {
  kind:'shared-firebase',
  async generate(context){
   const {prompt}=createMenuRequest(context);
   const model=await getModel();
   // Retry an invalid JSON/menu response once. Never accept a partial or
   // truncated plan: fixed dishes and all generation constraints still apply.
   let firstError=null;
   for(let attempt=0;attempt<2;attempt++){
    let responseText;
    try{
     const retry=attempt===0?'':`\\n前の返答は条件違反でした（${firstError.message}）。必ず${context.rules.days}日分すべてをdays配列に含め、形式・固定料理・分類別品数・新しい主菜の条件を満たしたJSONのみを返してください。`;
     const result=await model.generateContent(prompt+retry);
     responseText=result?.response?.text();
    }catch(error){
     const details=String(error?.message||'');
     if(/429|quota|RESOURCE_EXHAUSTED|rate.limit/i.test(details))
      throw Error('AIの無料利用枠または回数制限に達しました。通常の献立生成をご利用ください。');
     if(/app.check|recaptcha|permission.denied|403/i.test(details))
      throw Error('AIの不正利用防止認証に失敗しました。通信環境を確認してください。');
     throw Error('AIから献立を取得できませんでした。通常の献立生成をご利用ください。');
    }
    try{
     const plan=parseMenuResponse(responseText,context);
     if(firstError)plan.warnings=[`AIの初回応答に問題があったため再生成し、${context.rules.days}日分を完成させました。初回: ${firstError.message}`];
     return plan;
    }catch(error){
     if(attempt===1)throw Error(`AIの再生成後も条件を満たせませんでした。${error.message}`);
     firstError=error;
    }
   }
  }
 };
}
