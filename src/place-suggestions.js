// Photon supplies candidates; this module applies order-independent keyword AND matching
// to the returned place names, branches and address fragments. No default location.
const ENDPOINT='https://photon.komoot.io/api/';
export const LOCATION_ATTRIBUTION='© OpenStreetMap contributors · Photon (komoot)';
const clean=x=>String(x??'').trim();
const normalize=x=>clean(x).normalize('NFKC').toLocaleLowerCase().replace(/[\s\u3000]+/gu,'');
export function placeKeywords(query){
 return clean(query).normalize('NFKC').split(/\s+/u).filter(Boolean).slice(0,8);
}
const fields=p=>[
 p.name,p.name_en,p.alt_name,p.street,p.housenumber,p.city,p.district,
 p.suburb,p.locality,p.state,p.county,p.postcode,p.country,
 p.extra?.name,p.extra?.['name:ja'],p.extra?.['alt_name']
].filter(x=>typeof x==='string'&&x.trim());
export function formatPlace(feature){
 const p=feature?.properties||{};
 const name=clean(p.name||p.street||p.city);
 if(!name)return null;
 const city=clean(p.city),district=clean(p.district||p.suburb||p.locality);
 const street=[clean(p.street),clean(p.housenumber)].filter(Boolean).join(' ');
 const detail=[p.state,city,district,street,p.postcode].map(clean).filter(x=>x&&x!==name);
 const value=[name,city&&city!==name?city:'',district&&district!==name&&district!==city?district:'',street&&street!==name?street:'']
  .filter(Boolean).join(' ');
 const address=[p.country,p.state,p.county,p.city,p.district,p.suburb,p.locality,p.street,p.housenumber,p.postcode]
  .map(clean).filter(Boolean).join('');
 return {name,detail:[...new Set(detail)].join('・'),value,
  searchText:normalize(fields(p).join(' '))+' '+normalize(address)};
}
export function placesFromPhoton(response,limit=60){
 const seen=new Set(),results=[];
 for(const feature of response?.features||[]){
  const place=formatPlace(feature);
  if(!place)continue;
  const key=place.value+'|'+place.detail;
  if(seen.has(key))continue;
  seen.add(key);results.push(place);
  if(results.length>=limit)break;
 }
 return results;
}
function matchesToken(text,token){
 const key=normalize(token);
 if(!key)return false;
 if(text.includes(key))return true;
 // The person may type a branch suffix although OSM stores only its locality.
 const withoutBranch=key.replace(/(?:支店|本店|店)$/u,'');
 return withoutBranch.length>=2&&withoutBranch!==key&&text.includes(withoutBranch);
}
export function matchesPlaceKeywords(place,query){
 const terms=placeKeywords(query);
 const text=place.searchText||normalize([place.name,place.detail,place.value].join(' '));
 return terms.every(term=>matchesToken(text,term));
}
export function filterPlaceCandidates(candidates,query,limit=12){
 const seen=new Set(),matching=[];
 for(const place of candidates||[]){
  if(!place||!matchesPlaceKeywords(place,query))continue;
  const key=place.value+'|'+place.detail;
  if(seen.has(key))continue;
  seen.add(key);matching.push(place);
 }
 const terms=placeKeywords(query);
 return matching.map((place,i)=>{
  const name=normalize(place.name);
  const score=terms.reduce((sum,term)=>sum+(matchesToken(name,term)?5:0),0);
  return {place,score,i};
 }).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,limit).map(x=>x.place);
}
// Retain the compatibility utility, but never require the user to type a fixed
// "business then location" order in the actual matching/search algorithm.
export function splitPlaceQuery(input){
 const q=clean(input).replace(/[\s\u3000]+/gu,' ');
 const split=q.lastIndexOf(' ');
 return split<=0?{name:q,area:''}:{name:q.slice(0,split).trim(),area:q.slice(split+1).trim()};
}
function locationCoordinates(result,term){
 const feature=result?.features?.[0];
 const coords=feature?.geometry?.coordinates,p=feature?.properties||{};
 if(!Array.isArray(coords)||coords.length<2||!Number.isFinite(coords[0])||!Number.isFinite(coords[1]))return null;
 const kind=clean(p.osm_key).toLowerCase(),val=clean(p.osm_value).toLowerCase();
 if(['shop','amenity','tourism','office','craft'].includes(kind))return null;
 // Prefer administrative areas, addresses and stations as anchors.
 if(kind&&!(kind==='place'||kind==='railway'||kind==='highway'||kind==='boundary'||kind==='addr'))return null;
 if(kind==='railway'&&!['station','halt','subway_entrance'].includes(val))return null;
 return {lon:coords[0],lat:coords[1],term};
}
const branchPart=s=>s.replace(/(?:支店|本店|店)$/u,'').trim()||s;
export async function searchPlaces(term,{
 area='',fetcher=(...args)=>globalThis.fetch(...args),signal,online=true,seed=[],onCandidates
}={}){
 const full=clean(term).normalize('NFKC').replace(/\s+/gu,' '),terms=placeKeywords(full);
 if(!online||Array.from(full).length<2)return filterPlaceCandidates(seed,full);
 const collected=[...seed];
 const query=async (q,{focus=null,limit=60}={})=>{
  const url=new URL(ENDPOINT);
  url.searchParams.set('q',q.slice(0,120));
  url.searchParams.set('limit',String(limit));
  url.searchParams.set('dedupe','0');
  if(focus){
   url.searchParams.set('lon',String(focus.lon));
   url.searchParams.set('lat',String(focus.lat));
   url.searchParams.set('zoom','12');
   url.searchParams.set('location_bias_scale','0.2');
  }
  const response=await fetcher(url.toString(),{signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('地名候補の取得に失敗しました');
  return response.json();
 };
 const add=response=>{
  const batch=placesFromPhoton(response);
  collected.push(...batch);
  if(batch.length)onCandidates?.(batch);
  return filterPlaceCandidates(collected,area?full:full);
 };
 if(area){
  // Kept for programmatic callers; the UI always uses a single query field.
  const geo=await query(clean(area),{limit:1});
  const focus=locationCoordinates(geo,area);
  const matches=add(await query(full,{focus}));
  return matches;
 }
 let matched=add(await query(full));
 if(terms.length<2||matched.length>=8)return matched;
 // A combined Photon query may omit results that separately match name and
 // address. Resolve at most two user-supplied fragments as possible locations,
 // then search the remaining business term near that location.
 const byLocation=terms.map((t,i)=>({t,i,score:/(?:都|道|府|県|市|区|町|村|駅|駅前|丁目)$/u.test(t)?2:0}));
 byLocation.sort((a,b)=>b.score-a.score||(b.i-a.i));
 let focus=null,geoIndex=-1;
 for(const item of byLocation.slice(0,2)){
  const geo=await query(branchPart(item.t),{limit:1});
  const coords=locationCoordinates(geo,item.t);
  if(coords){focus=coords;geoIndex=item.i;break;}
 }
 if(focus){
  // Try opposite-end keywords first, then one more term if the first one
  // names a district rather than the business. This works regardless of order.
  const indices=geoIndex===0?
   [terms.length-1,1,terms.length-2]:
   geoIndex===terms.length-1?[0,terms.length-2,1]:
   [terms.length-1,0];
  const nameCandidates=[...new Set(indices)].filter(i=>i>=0&&i<terms.length&&i!==geoIndex);
  for(const index of nameCandidates.slice(0,2)){
   matched=add(await query(terms[index],{focus}));
   if(matched.length>=1)break;
  }
 }else{
  // No believable location: at least retrieve results for a likely name part.
  matched=add(await query(terms[0]));
 }
 return matched;
}
