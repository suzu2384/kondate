import {mkdir,rm,cp,writeFile} from 'node:fs/promises';
const clientId=(process.env.GOOGLE_OAUTH_CLIENT_ID||'').trim();
if(clientId&&!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))
 throw Error('GOOGLE_OAUTH_CLIENT_ID に正しいウェブアプリ用OAuthクライアントIDを設定してください。');
await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for(const path of ['index.html','style.css','manifest.webmanifest','sw.js','icons','src'])
 await cp(path,`dist/${path}`,{recursive:true});
await writeFile('dist/src/config.js',`/** Public OAuth client ID injected at build time. */\nexport const GOOGLE_CLIENT_ID = ${JSON.stringify(clientId)};\n`);
console.log(clientId?'Google OAuth client ID configured for Pages.':'No Google OAuth client ID configured; Google login is disabled.');
console.log('Static app built in dist/');
