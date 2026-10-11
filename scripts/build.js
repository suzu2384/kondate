import {mkdir,rm,cp,writeFile,readFile} from 'node:fs/promises';
import {ICON_CHOICES} from '../src/calendar-display.js';
const clientId=(process.env.GOOGLE_OAUTH_CLIENT_ID||'').trim();
if(clientId&&!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))
 throw Error('GOOGLE_OAUTH_CLIENT_ID に正しいウェブアプリ用OAuthクライアントIDを設定してください。');
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for(const path of ['index.html','style.css','manifest.webmanifest','sw.js','icons','src'])
 await cp(path,`dist/${path}`,{recursive:true});
await writeFile('dist/src/config.js',`/** Public OAuth client ID injected at build time. */\nexport const GOOGLE_CLIENT_ID = ${JSON.stringify(clientId)};\n`);
// Shared AI is opt-in only after the project owner explicitly verifies the
// isolated Firebase project is Spark AND has no linked billing account.
const firebaseJson=(process.env.KONDATE_AI_FIREBASE_CONFIG||'').trim();
const siteKey=(process.env.KONDATE_AI_APP_CHECK_SITE_KEY||'').trim();
const sparkConfirmed=process.env.KONDATE_AI_SPARK_VERIFIED==='true';
let aiPublicConfig={mode:'disabled',firebase:null,appCheckSiteKey:'',
 model:'gemini-3.5-flash-lite',maxPerDevicePerDay:3};
if(sparkConfirmed){
 if(!firebaseJson||!siteKey)throw Error('AIを有効化するにはFirebase設定とApp Checkサイトキーの両方が必要です。');
 let config;
 try{config=JSON.parse(firebaseJson);}catch{throw Error('KONDATE_AI_FIREBASE_CONFIG はJSONで指定してください。');}
 if(!config||!['apiKey','projectId','appId'].every(k=>typeof config[k]==='string'&&config[k].trim()))
  throw Error('FirebaseのWebアプリ設定（apiKey, projectId, appId）が不足しています。');
 if(siteKey.length<10)throw Error('App Checkのサイトキーが不正です。');
 aiPublicConfig={...aiPublicConfig,mode:'shared-firebase',firebase:config,appCheckSiteKey:siteKey};
}
await writeFile('dist/src/ai-config.js',
 `/** Public config; do not place Gemini API keys or debug tokens here. */\nexport const AI_PUBLIC_CONFIG=Object.freeze(${JSON.stringify(aiPublicConfig)});\n`);
// Extract each vector's path directly from the committed SVG artwork.
// This is build-time only: no extra module fetch is required in browsers.
const entries=await Promise.all(ICON_CHOICES.map(async name=>{
 const svg=await readFile(`icons/presets/${name}.svg`,'utf8');
 const paths=[...svg.matchAll(/<path\b([^>]*)>/g)].map(([,attributes])=>{
  const d=/\bd="([^"]+)"/.exec(attributes)?.[1];
  if(!d)throw Error(`SVGのパスデータがありません: ${name}`);
  // The supplied icons sometimes need evenodd winding for their cutouts.
  // Retain it when embedding the artwork, so holes in faces/objects stay open.
  const fillRule=/\bfill-rule="(evenodd|nonzero)"/.exec(attributes)?.[1];
  return fillRule==='evenodd'?{d,fillRule}:d;
 });
 if(!paths.length||(svg.match(/<path\b/g)||[]).length!==paths.length)
  throw Error(`SVGのパスを読み取れません: ${name}`);
 return [name,paths];
}));
const marker='const PRESET_ICON_PATHS = /* EMBED_PRESET_ICON_PATHS */ {};';
const source=await readFile('dist/src/app.js','utf8');
if(!source.includes(marker))throw Error('プリセットアイコンの埋め込み位置が見つかりません。');
await writeFile('dist/src/app.js',source.replace(marker,
 `const PRESET_ICON_PATHS = ${JSON.stringify(Object.fromEntries(entries))};`));
console.log(`Embedded crisp SVG icon paths for ${entries.length} presets.`);
console.log(clientId?'Google OAuth client ID configured for Pages.':'No Google OAuth client ID configured; Google login is disabled.');
console.log(aiPublicConfig.mode==='shared-firebase'?'Shared AI enabled after owner Spark confirmation.':'Shared AI disabled; no provider credentials shipped.');
console.log('Static app built in dist/');
