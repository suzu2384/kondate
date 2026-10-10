// Photon is an OpenStreetMap-based public demo service. Queries are user-driven and debounced.
// Its place coverage is incomplete, so free-text entry remains available.
const ENDPOINT='https://photon.komoot.io/api/';
export const LOCATION_ATTRIBUTION='© OpenStreetMap contributors · Photon (komoot)';
const clean=x=>String(x||'').trim();
export function formatPlace(feature){
 const p=feature?.properties||{};
 const name=clean(p.name||p.street||p.city);
 if(!name)return null;
 const city=clean(p.city),district=clean(p.district||p.suburb||p.locality);
 const street=[clean(p.street),clean(p.housenumber)].filter(Boolean).join(' ');
 const details=[p.state,city,district,street].map(clean).filter(x=>x&&x!==name);
 const value=[name,city&&city!==name?city:'',district&&district!==name&&district!==city?district:'',street&&street!==name?street:''].filter(Boolean).join(' ');
 return {name,detail:[...new Set(details)].join('・'),value};
}
export function placesFromPhoton(response,limit=12){
 const seen=new Set(),results=[];
 for(const feature of response?.features||[]){
  const place=formatPlace(feature);
  if(!place||seen.has(place.value+'|'+place.detail))continue;
  seen.add(place.value+'|'+place.detail);results.push(place);
  if(results.length>=limit)break;
 }
 return results;
}
export function splitPlaceQuery(input){
 const q=clean(input).replace(/[\s\u3000]+/gu,' ');
 const split=q.lastIndexOf(' ');
 if(split<=0)return {name:q,area:''};
 return {name:q.slice(0,split).trim(),area:q.slice(split+1).trim()};
}
export async function searchPlaces(term,{area='',fetcher=(...args)=>globalThis.fetch(...args),signal,online=true}={}){
 const full=clean(term);
 if(!online||Array.from(full).length<2)return [];
 // "shop area" is supported in the same field; there is no default region.
 const {name:q,area:region}=area?{name:full,area:clean(area)}:splitPlaceQuery(full);
 const request=async url=>{
  const result=await fetcher(url.toString(),{signal,headers:{Accept:'application/json'}});
  if(!result.ok)throw Error('地名候補の取得に失敗しました');
  return result.json();
 };
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
  url.searchParams.set('location_bias_scale','0.8');
 }
 return placesFromPhoton(await request(url),12);
}
