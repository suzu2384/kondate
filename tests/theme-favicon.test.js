import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recolorFaviconBackground,setFaviconBackground} from '../src/theme-favicon.js';
import {themeBackgroundColor} from '../src/themes.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const originalIcon=read('icons/icon.svg');

test('browser favicon changes only its background, preserving original artwork',()=>{
 for(const background of ['#fbfbfd','#15191e','#aabbcc']){
  const edited=recolorFaviconBackground(originalIcon,background);
  assert.match(edited,new RegExp('<rect[^>]*fill="'+background+'"'));
  assert.equal(edited.replace(background,'#FBF8F4'),originalIcon);
  assert.match(edited,/#F58A4F/);
  assert.match(edited,/#5D7D55/);
 }
 assert.throws(()=>recolorFaviconBackground(originalIcon,'color-mix()'),/背景色/);
 assert.throws(()=>recolorFaviconBackground('<svg></svg>','#112233'),/背景/);
});

test('rapid theme changes update favicon to the newest background with one original request',async()=>{
 const oldDocument=globalThis.document,oldFetch=globalThis.fetch;
 const link={href:'./icons/icon.svg?v=1.3.63',getAttribute(field){return field==='href'?this.href:null;},setAttribute(field,value){if(field==='href')this.href=value;}};
 const requests=[];
 let finish;
 const responseBody=new Promise(resolve=>{finish=resolve;});
 try{
  globalThis.document={querySelector:selector=>selector==='link[rel="icon"][type="image/svg+xml"]'?link:null};
  globalThis.fetch=async src=>{requests.push(src);return {ok:true,text:()=>responseBody};};
  const light=themeBackgroundColor({color:'red',mode:'light'});
  const dark=themeBackgroundColor({color:'blue',mode:'dark'});
  const first=setFaviconBackground(light);
  const second=setFaviconBackground(dark);
  finish(originalIcon);
  await Promise.all([first,second]);
  assert.deepEqual(requests,['./icons/icon.svg?v=1.3.63']);
  assert.match(link.href,/^data:image\/svg\+xml;charset=utf-8,/);
  let svg=decodeURIComponent(link.href.split(',')[1]);
  assert.match(svg,new RegExp('<rect[^>]*fill="'+dark+'"'));
  assert.equal(svg.replace(dark,'#FBF8F4'),originalIcon);

  // Restoring the prior shade immediately must not leave an older theme active.
  await setFaviconBackground(light);
  svg=decodeURIComponent(link.href.split(',')[1]);
  assert.match(svg,new RegExp('<rect[^>]*fill="'+light+'"'));
  assert.equal(requests.length,1);
 }finally{
  if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  if(oldFetch===undefined)delete globalThis.fetch;else globalThis.fetch=oldFetch;
 }
});

test('PWA install icons and manifest remain static while browser favicon changes',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));
 const html=read('index.html');
 const sw=read('sw.js');
 assert.ok(manifest.icons.every(icon=>/\.png\?v=1\.3\.63$/.test(icon.src)));
 assert.match(html,/rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png\?v=1\.3\.63"/);
 assert.match(html,/rel="icon" href="\.\/icons\/icon\.svg\?v=1\.3\.63"/);
 assert.match(sw,/\.\/src\/theme-favicon\.js/);
});
