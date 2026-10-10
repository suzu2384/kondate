// Browser-only TomTom Places Suggest adapter. Never commit a user's API key.
const ENDPOINT='https://api.tomtom.com/maps/orbis/places/suggest';
const KEY_NAME='kondate.tomtom-api-key.v1';
export function getTomTomKey(storage=globalThis.localStorage){
 try{return String(storage?.getItem(KEY_NAME)||'').trim();}catch{return '';}
}
export function setTomTomKey(value,storage=globalThis.localStorage){
 const key=String(value||'').trim();
 try{if(key)storage?.setItem(KEY_NAME,key);else storage?.removeItem(KEY_NAME);}catch{
  throw Error('このブラウザでは検索用APIキーを保存できません。');
 }
 return Boolean(key);
}
export function normalizeTomTomSuggestions(payload){
 const seen=new Set(),places=[];
 for(const item of payload?.results||[]){
  if(!item||item.type==='discoverAction')continue;
  const name=String(item.title||'').trim();
  if(!name)continue;
  const detail=(Array.isArray(item.subtitles)?item.subtitles:[]).filter(x=>typeof x==='string'&&x.trim()).join('・');
  const a=item.address||{};
  const fallback=[a.countrySubdivision,a.municipality,a.municipalitySubdivision,a.street,a.houseNumber]
   .filter(Boolean).join(' ');
  const address=detail||fallback;
  const value=[name,address].filter(Boolean).join(' ');
  if(seen.has(value))continue;
  seen.add(value);
  places.push({name,detail:address,value,source:'tomtom'});
 }
 return places;
}
export async function searchTomTomPlaces(query,{
 apiKey=getTomTomKey(),signal,fetcher=(...args)=>globalThis.fetch(...args)
}={}){
 if(!apiKey)throw Error('TomTom検索のAPIキーが未設定です。');
 if(!String(query||'').trim())return [];
 const result=await fetcher(ENDPOINT,{
  method:'POST',signal,
  headers:{
   'TomTom-Api-Key':apiKey,'TomTom-Api-Version':'3',
   'Attributes':'results','Accept-Language':'ja-JP,ja;q=0.9',
   'Content-Type':'application/json','Accept':'application/json'
  },
  body:JSON.stringify({query:String(query).trim(),maxResults:10})
 });
 if(!result.ok){
  const msg=result.status===401||result.status===403?'APIキーまたはドメイン制限を確認してください。':
   result.status===429?'無料プランの検索回数または速度制限に達しました。':
   '店舗検索サービスに接続できません。';
  const error=new Error('TomTom: '+msg);
  error.status=result.status;throw error;
 }
 return normalizeTomTomSuggestions(await result.json());
}
