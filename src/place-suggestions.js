// Photon is an OpenStreetMap-based public demo service. Search only on user request.
// Some business locations may not exist in OSM; manual entry is always available.
const ENDPOINT='https://photon.komoot.io/api/';
export const LOCATION_ATTRIBUTION='© OpenStreetMap contributors · Photon (komoot)';
const clean=x=>String(x||'').trim();
export function formatPlace(feature){
 const p=feature?.properties||{};
 const name=clean(p.name||p.street||p.city);
 if(!name)return null;
 const city=clean(p.city),district=clean(p.district||p.suburb||p.locality);
 const street=[clean(p.street),clean(p.housenumber)].filter(Boolean).join(' ');
 const detail=[p.state,city,district,street].map(clean).filter(x=>x&&x!==name);
 const distinct=[...new Set(detail)];
 const value=[name,city&&city!==name?city:'',district&&district!==name&&district!==city?district:'',street&&street!==name?street:'']
  .filter(Boolean).join(' ');
 return {name,detail:distinct.join('・'),value};
}
export function placesFromPhoton(response,limit=12){
 const seen=new Set(),results=[];
 for(const feature of response?.features||[]){
  const place=formatPlace(feature);
  if(!place||seen.has(place.value+'|'+place.detail))continue;
  seen.add(place.value+'|'+place.detail);
  results.push(place);
  if(results.length>=limit)break;
 }
 return results;
}
export async function searchPlaces(term,{area='',fetcher=(...args)=>globalThis.fetch(...args),signal,online=true}={}){
 const q=clean(term),region=clean(area);
 if(!online||Array.from(q).length<2)return [];
 const request=async url=>{
  const result=await fetcher(url.toString(),{signal,headers:{Accept:'application/json'}});
  if(!result.ok)throw Error('地名候補の取得に失敗しました');
  return result.json();
 };
 // Resolve only the user-supplied region to coordinates and prefer nearby shops.
 // Do not apply any automatic or hard-coded location.
 let focus=null;
 if(region){
  const geo=new URL(ENDPOINT);
  geo.searchParams.set('q',region.slice(0,120));
  geo.searchParams.set('limit','1');
  geo.searchParams.set('lang','default');
  const result=await request(geo);
  const coordinates=result?.features?.[0]?.geometry?.coordinates;
  if(Array.isArray(coordinates)&&coordinates.length>=2&&
   Number.isFinite(coordinates[0])&&Number.isFinite(coordinates[1]))
   focus={lon:coordinates[0],lat:coordinates[1]};
 }
 const url=new URL(ENDPOINT);
 url.searchParams.set('q',(focus?q:[q,region].filter(Boolean).join(' ')).slice(0,120));
 url.searchParams.set('lang','default');
 url.searchParams.set('limit','20');
 url.searchParams.set('dedupe','0');
 if(focus){
  url.searchParams.set('lon',String(focus.lon));
  url.searchParams.set('lat',String(focus.lat));
  url.searchParams.set('zoom','12');
  url.searchParams.set('location_bias_scale','0');
 }
 return placesFromPhoton(await request(url),12);
}
