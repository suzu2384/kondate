import test from 'node:test';
import assert from 'node:assert/strict';
import {colors} from '../src/themes.js';
function luminance(hex){const rgb=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('all 14 theme accent text and button labels meet 4.5:1 contrast',()=>{for(const[name,c]of Object.entries(colors)){assert.ok(contrast(c.light,'#fffefa')>=4.5,`${name} light text`);assert.ok(contrast(c.light,'#ffffff')>=4.5,`${name} light button`);assert.ok(contrast(c.dark,'#222925')>=4.5,`${name} dark text`);assert.ok(contrast(c.dark,'#17231b')>=4.5,`${name} dark button`);}for(const [a,b] of [['#25332b','#fffefa'],['#626d65','#fffefa'],['#edf0eb','#222925'],['#adbab0','#222925']])assert.ok(contrast(a,b)>=4.5);});

test('light theme is bright across all colors, not only the page background',async()=>{
 const {applyTheme}=await import('../src/themes.js');
 const originalDocument=globalThis.document,originalMatchMedia=globalThis.matchMedia;
 const render=(color,mode,darkPreference=false)=>{
  const values=new Map(),element={style:{
   setProperty:(key,value)=>values.set(key,value),colorScheme:''
  },dataset:{}};
  const meta={content:''};
  globalThis.document={documentElement:element,querySelector:()=>meta};
  globalThis.matchMedia=()=>({matches:darkPreference});
  applyTheme({color,mode});
  return {values,element,meta};
 };
 const rgba=hex=>hex.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16));
 const resolve=value=>{
  const found=/^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, (#[0-9a-f]{6})\)$/i.exec(value);
  if(!found)throw Error('Unknown theme color: '+value);
  const [,foreground,percent,background]=found;
  const fraction=Number(percent)/100,fg=rgba(foreground.slice(1)),bg=rgba(background.slice(1));
  return '#'+fg.map((c,i)=>Math.round(c*fraction+bg[i]*(1-fraction)).toString(16).padStart(2,'0')).join('');
 };
 try{
  for(const name of Object.keys(colors)){
   const light=render(name,'light'),dark=render(name,'dark');
   for(const key of ['bg','surface','panel','text','muted','line','tint']){
    const l=light.values.get('--'+key),d=dark.values.get('--'+key);
    assert.ok(l&&d, name+' missing '+key);
    assert.notEqual(l,d,name+' both modes should style '+key);
   }
   const v=key=>resolve(light.values.get('--'+key));
   assert.ok(luminance(v('bg'))>.90,name+' light background');
   assert.ok(luminance(v('surface'))>.95,name+' light card and input');
   assert.ok(luminance(v('panel'))>.78,name+' light panels');
   assert.ok(luminance(v('surface'))>luminance(v('panel')),name+' light surfaces have depth');
   assert.ok(contrast(v('text'),v('surface'))>=4.5,name+' readable light text');
   assert.ok(contrast(v('muted'),v('surface'))>=4.5,name+' readable muted labels');
   const dv=key=>resolve(dark.values.get('--'+key));
   assert.ok(luminance(dv('bg'))<luminance(dv('surface')),name+' dark page and cards contrast');
   assert.ok(luminance(dv('surface'))<luminance(dv('panel')),name+' dark card and panel contrast');
   assert.ok(contrast(dv('text'),dv('surface'))>=4.5,name+' readable dark text');
   assert.ok(contrast(dv('muted'),dv('surface'))>=4.5,name+' readable dark labels');
   assert.equal(light.element.dataset.themeMode,'light');
   assert.equal(dark.element.dataset.themeMode,'dark');
   assert.equal(light.element.style.colorScheme,'light');
   assert.equal(dark.element.style.colorScheme,'dark');
   assert.equal(light.meta.content,light.values.get('--bg'));
   assert.equal(dark.meta.content,dark.values.get('--bg'));
  }
  assert.equal(render('green','auto',true).element.dataset.themeMode,'dark');
  assert.equal(render('green','auto',false).element.dataset.themeMode,'light');
 }finally{
  if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
  if(originalMatchMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=originalMatchMedia;
 }
});
