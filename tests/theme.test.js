import test from 'node:test';
import assert from 'node:assert/strict';
import {colors,themeBackgroundColor} from '../src/themes.js';
function luminance(hex){const rgb=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('all theme accent text and button labels meet 4.5:1 contrast',()=>{for(const[name,c]of Object.entries(colors)){assert.ok(contrast(c.light,'#fffefa')>=4.5,`${name} light text`);assert.ok(contrast(c.light,'#ffffff')>=4.5,`${name} light button`);assert.ok(contrast(c.dark,'#222925')>=4.5,`${name} dark text`);assert.ok(contrast(c.dark,'#17231b')>=4.5,`${name} dark button`);}for(const [a,b] of [['#25332b','#fffefa'],['#626d65','#fffefa'],['#edf0eb','#222925'],['#adbab0','#222925']])assert.ok(contrast(a,b)>=4.5);});

test('light theme is bright across all colors, not only the page background',async()=>{
 const {applyTheme}=await import('../src/themes.js');
 const originalDocument=globalThis.document,originalMatchMedia=globalThis.matchMedia;
 const render=(color,mode,darkPreference=false)=>{
  const values=new Map(),element={style:{
   setProperty:(key,value)=>values.set(key,value),colorScheme:''
  },dataset:{}};
  const meta={content:''};
  globalThis.document={documentElement:element,querySelector:selector=>selector==='meta[name="theme-color"]'?meta:null};
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
   assert.equal(light.meta.content,v('bg'));
   assert.equal(dark.meta.content,dv('bg'));
   assert.equal(light.meta.content,themeBackgroundColor({color:name,mode:'light'}));
   assert.equal(dark.meta.content,themeBackgroundColor({color:name,mode:'dark'}));
   assert.notEqual(light.meta.content,dark.meta.content);
  }
  assert.equal(render('green','auto',true).element.dataset.themeMode,'dark');
  assert.equal(render('green','auto',false).element.dataset.themeMode,'light');
  assert.equal(themeBackgroundColor({color:'green',mode:'auto'},true),themeBackgroundColor({color:'green',mode:'dark'}));
  assert.equal(themeBackgroundColor({color:'green',mode:'auto'},false),themeBackgroundColor({color:'green',mode:'light'}));
 }finally{
  if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
  if(originalMatchMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=originalMatchMedia;
 }
});

test('every original palette has a distinct higher-chroma option without changing legacy colors',()=>{
 const legacy={
  red:['#9a4545','#ecaaaa'],yellow:['#776016','#e2cd7d'],
  green:['#436e57','#a4d3b3'],cyan:['#256c76','#8fd3dc'],
  blue:['#4167a1','#abc8f1'],magenta:['#875081','#dcafda'],
  mono:['#525b61','#c4cbd0']
 };
 assert.equal(Object.keys(colors).length,14);
 for(const [id,old] of Object.entries(legacy)){
  assert.deepEqual([colors[id].light,colors[id].dark],old);
  const rich=colors[id+'-rich'];
  assert.ok(rich?.rich,id+' missing richer alternative');
  assert.notEqual(rich.light,colors[id].light);
  assert.notEqual(rich.dark,colors[id].dark);
  assert.ok(contrast(rich.light,'#ffffff')>=4.5,id+' richer light accent contrast');
  assert.ok(contrast(rich.dark,'#17231b')>=4.5,id+' richer dark accent contrast');
 }
});

test('richer themes color foreground only and retain old surface backgrounds',async()=>{
 const {applyTheme}=await import('../src/themes.js');
 const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia;
 const get=(name,mode)=>{
  const result=new Map();
  globalThis.document={documentElement:{style:{setProperty:(key,val)=>result.set(key,val)},dataset:{}},querySelector:()=>null};
  globalThis.matchMedia=()=>({matches:false});
  applyTheme({color:name,mode});
  return result;
 };
 try{
  for(const name of ['red','yellow','green','cyan','blue','magenta','mono']){
   for(const mode of ['light','dark']){
    const standard=get(name,mode),rich=get(name+'-rich',mode);
    const pct=x=>Number(x.match(/ (\d+(?:\.\d+)?)%,/)[1]);
    assert.ok(pct(rich.get('--text'))>pct(standard.get('--text')),name+' '+mode+' text saturation');
    assert.ok(pct(rich.get('--muted'))>pct(standard.get('--muted')),name+' '+mode+' muted saturation');
    for(const key of ['bg','surface','panel','line','tint'])assert.equal(rich.get('--'+key),standard.get('--'+key),name+' '+mode+' '+key);
    assert.equal(themeBackgroundColor({color:name,mode}),themeBackgroundColor({color:name+'-rich',mode}));
   }
  }
 }finally{
  if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  if(oldMedia===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMedia;
 }
});


