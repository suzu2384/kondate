/** Only the browser-tab favicon is recolored. Installed PWA icons stay unchanged. */
export function recolorFaviconBackground(svg,color){
 if(typeof svg!=='string'||!/^#[0-9a-f]{6}$/i.test(color))
  throw Error('タブアイコンの背景色が不正です。');
 const background=/(<rect\b[^>]*\bfill=")#[0-9a-f]{6}(")/i;
 if(!background.test(svg))throw Error('タブアイコンの背景を特定できません。');
 return svg.replace(background,(_,before,after)=>before+color+after);
}

let sourcePromise=null;
let requestedColor='',appliedColor='';
/** Fetch the original icon only once; ignore stale theme-switch responses. */
export async function setFaviconBackground(color){
 const link=document.querySelector('link[rel="icon"][type="image/svg+xml"]');
 if(!link)return;
 requestedColor=color;
 if(appliedColor===color)return;
 if(!sourcePromise){
  const original=link.getAttribute('href');
  sourcePromise=fetch(original).then(response=>{
   if(!response.ok)throw Error('タブアイコンを読み込めませんでした。');
   return response.text();
  }).catch(error=>{sourcePromise=null;throw error;});
 }
 const source=await sourcePromise;
 if(requestedColor!==color)return;
 const favicon=recolorFaviconBackground(source,color);
 link.setAttribute('href','data:image/svg+xml;charset=utf-8,'+encodeURIComponent(favicon));
 appliedColor=color;
}
