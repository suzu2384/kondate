import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPlace,placesFromPhoton,searchPlaces,LOCATION_ATTRIBUTION} from '../src/place-suggestions.js';

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
 assert.equal(options[0].value,'食堂みどり');
 assert.ok(LOCATION_ATTRIBUTION.includes('OpenStreetMap'));
 assert.equal(formatPlace(null),null);
});
test('online search encodes Japanese input, caps suggestions and is aborted by caller',async()=>{
 let calls=0;
 const controller=new AbortController();
 const suggestions=await searchPlaces('津田沼 レストラン',{
  signal:controller.signal,fetcher:async(url,opt)=>{
   calls++;
   const parsed=new URL(url);
   assert.equal(parsed.host,'photon.komoot.io');
   assert.equal(parsed.searchParams.get('q'),'津田沼 レストラン');
   assert.equal(parsed.searchParams.get('lang'),'ja');
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
