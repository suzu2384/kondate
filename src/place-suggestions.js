// Photon is a public OpenStreetMap-based *demo* search service, not a guaranteed SLA.
// Queries are debounced, sent only with meaningful text and may fail quietly.
const ENDPOINT='https://photon.komoot.io/api/';
export const LOCATION_ATTRIBUTION='© OpenStreetMap contributors · Photon (komoot)';
export function formatPlace(feature){
 const p=feature?.properties||{};
 const name=String(p.name||p.street||p.city||'').trim();
 const place=[p.street&&p.street!==name?p.street:'',p.housenumber,p.district,p.city&&p.city!==name?p.city:'',p.state]
  .map(x=>String(x||'').trim()).filter(Boolean);
 if(!name)return null;
 const detail=[...new Set(place)].join('・');
 return {name,detail,value:name};
}
export function placesFromPhoton(response,limit=5){
 const seen=new Set(),results=[];
 for(const feature of response?.features||[]){
  const place=formatPlace(feature);
  if(!place||seen.has(place.name+'|'+place.detail))continue;
  seen.add(place.name+'|'+place.detail);results.push(place);
  if(results.length>=limit)break;
 }
 return results;
}
export async function searchPlaces(term,{fetcher=(...args)=>globalThis.fetch(...args),signal,online=true}={}){
 const q=String(term||'').trim();
 if(!online||Array.from(q).length<2)return [];
 const url=new URL(ENDPOINT);
 url.searchParams.set('q',q.slice(0,120));
 url.searchParams.set('lang','ja');
 url.searchParams.set('limit','6');
 const result=await fetcher(url.toString(),{signal,headers:{Accept:'application/json'}});
 if(!result.ok)throw Error('地名候補の取得に失敗しました');
 return placesFromPhoton(await result.json());
}
