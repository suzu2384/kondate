import {createFirebaseAIProvider} from './ai-firebase.js';

export const AI_PROVIDER_MODES=Object.freeze({
 DISABLED:'disabled',SHARED:'shared-firebase',PERSONAL:'personal'
});

/**
 * Provider boundary. The shared mode never reads personal API credentials.
 * A future personal-credential flow can pass an independently implemented
 * provider into the PERSONAL mode without changing the menu UI/validator.
 * No user API keys are stored or requested in this release.
 */
export function createAIProvider(config={},options={}){
 const mode=config.mode||AI_PROVIDER_MODES.DISABLED;
 if(mode===AI_PROVIDER_MODES.DISABLED)return null;
 if(mode===AI_PROVIDER_MODES.PERSONAL)return options.personalProvider||null;
 if(mode===AI_PROVIDER_MODES.SHARED){
  if(!config.firebase?.apiKey||!config.firebase?.appId||!config.firebase?.projectId||!config.appCheckSiteKey)
   return null;
  if(config.model!=='gemini-3.5-flash-lite')return null;
  return createFirebaseAIProvider(config,options);
 }
 return null;
}
