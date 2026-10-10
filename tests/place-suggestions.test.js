import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPlace,placesFromPhoton,searchPlaces,splitPlaceQuery,LOCATION_ATTRIBUTION} from '../src/place-suggestions.js';

const response={features:[
 {properties:{name:'食堂みどり',street:'本町通り',city:'習志野市',state:'千葉県'}},
 {properties:{name:'喫茶店ひかり',city:'習志野市',state:'千葉県'}},
 {properties:{name:'食堂みどり',street:'本町通り',city:'習志野市',state:'千葉県'}},
 {properties:{city:'習志野市'}},
 {properties:{}}
]};
test('Photon suggestions deduplicate and include a readable place label',()=>{
 const options=placesFromPhoton(response);
 assert.equal(options.length,3);
 assert.equal(options[0].name,'食堂みどり');
 assert.match(options[0].detail,/習志野市/);
 assert.match(options[0].value,/食堂みどり 習志野市/);
 assert.ok(LOCATION_ATTRIBUTION.includes('OpenStreetMap'));
 assert.equal(formatPlace(null),null);
});
test('online search encodes Japanese input, caps suggestions and is aborted by caller',async()=>{
 let calls=0;
 const controller=new AbortController();
 const suggestions=await searchPlaces('レストラン',{
  signal:controller.signal,fetcher:async(url,opt)=>{
   calls++;
   const parsed=new URL(url);
   assert.equal(parsed.host,'photon.komoot.io');
   assert.equal(parsed.searchParams.get('q'),'レストラン');
   assert.equal(parsed.searchParams.get('lang'),null,'invalid pseudo-language must not be sent');
   assert.equal(opt.signal,controller.signal);
   return {ok:true,json:async()=>response};
  }
 });
 assert.equal(calls,1);
 assert.equal(suggestions[0].name,'食堂みどり');
 assert.deepEqual(await searchPlaces('津',{online:true,fetcher:()=>{throw Error('should not fetch');}}),[]);
 assert.deepEqual(await searchPlaces('津田沼',{online:false,fetcher:()=>{throw Error('should not fetch');}}),[]);
});
test('network failures surface to UI which can leave free-text values intact',async()=>{
 await assert.rejects(()=>searchPlaces('津田沼',{fetcher:async()=>({ok:false,status:429})}),/候補の取得/);
});

test('searching near an explicitly given region biases chain-store results and preserves address',async()=>{
 const calls=[],reply={features:[
  {properties:{name:'吉野家',street:'駅前通り',city:'A市',district:'南口'},geometry:{coordinates:[139.1,35.4]}},
  {properties:{name:'吉野家',street:'中央通り',city:'A市',district:'北口'},geometry:{coordinates:[139.2,35.4]}}
 ]};
 const results=await searchPlaces('吉野家',{area:'A駅',fetcher:async(url)=>{
  const u=new URL(url);calls.push(u);
  if(calls.length===1)return {ok:true,json:async()=>({features:[{geometry:{coordinates:[139.8,35.7]}}]})};
  return {ok:true,json:async()=>reply};
 }});
 assert.equal(calls.length,2);
 assert.equal(calls[0].searchParams.get('q'),'A駅');
 assert.equal(calls[1].searchParams.get('q'),'吉野家');
 assert.equal(calls[1].searchParams.get('lat'),'35.7');
 assert.equal(calls[1].searchParams.get('lon'),'139.8');
 assert.equal(calls[1].searchParams.get('dedupe'),'0');
 assert.equal(results.length,2);
 assert.notEqual(results[0].value,results[1].value,'branches must remain distinguishable');
 assert.match(results[0].detail,/南口/);
 assert.match(results[0].value,/駅前通り/);
});
test('unknown optional region is included in fallback search without assuming user location',async()=>{
 const calls=[];
 await searchPlaces('吉野家',{area:'指定地域',fetcher:async(url)=>{
  const u=new URL(url);calls.push(u.searchParams.get('q'));
  return {ok:true,json:async()=>({features:[]})};
 }});
 assert.deepEqual(calls,['指定地域','吉野家 指定地域']);
});

test('single-field query splits optional location suffix, including full-width whitespace',()=>{
 assert.deepEqual(splitPlaceQuery('吉野家　津田沼'),{name:'吉野家',area:'津田沼'});
 assert.deepEqual(splitPlaceQuery('  吉野家  津田沼駅  '),{name:'吉野家',area:'津田沼駅'});
 assert.deepEqual(splitPlaceQuery('吉野家'),{name:'吉野家',area:''});
 assert.deepEqual(splitPlaceQuery('スターバックス コーヒー 東京駅'),{name:'スターバックス コーヒー',area:'東京駅'});
});
test('single-field "business area" searches nearby without a preset location',async()=>{
 const calls=[];
 const results=await searchPlaces('吉野家　津田沼',{fetcher:async url=>{
  const u=new URL(url);calls.push(u);
  return {ok:true,json:async()=>calls.length===1?
   {features:[{geometry:{coordinates:[140.01,35.69]}}]}:
   {features:[{properties:{name:'吉野家',city:'習志野市',street:'駅前通り'}}]}};
 }});
 assert.equal(calls.length,2);
 assert.equal(calls[0].searchParams.get('q'),'津田沼');
 assert.equal(calls[1].searchParams.get('q'),'吉野家');
 assert.equal(calls[1].searchParams.get('location_bias_scale'),'0.8');
 assert.match(results[0].value,/駅前通り/);
});

test('branch suffix in the same input resolves the locality rather than searching for a place ending in 店',async()=>{
 const calls=[];
 const found=await searchPlaces('吉野家 津田沼店',{fetcher:async url=>{
  const params=new URL(url).searchParams;calls.push(params.get('q'));
  if(calls.length===1)return {ok:true,json:async()=>({features:[{geometry:{coordinates:[140.0,35.7]}}]})};
  return {ok:true,json:async()=>({features:[{properties:{name:'吉野家 津田沼店',city:'習志野市'}}]})};
 }});
 assert.deepEqual(calls,['津田沼','吉野家']);
 assert.match(found[0].name,/津田沼店/);
});
