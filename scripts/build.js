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
console.log('Static app built in dist/');
