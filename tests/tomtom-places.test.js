import test from 'node:test';
import assert from 'node:assert/strict';
import {getTomTomKey,setTomTomKey,normalizeTomTomSuggestions,searchTomTomPlaces} from '../src/tomtom-places.js';

function storage(){
 const m=new Map();
 return {getItem:key=>m.get(key)??null,setItem:(key,v)=>m.set(key,String(v)),removeItem:k=>m.delete(k),entries:()=>[...m.entries()]};
}
test('API key is opt-in, stays separate from Drive/export state, and can be deleted',()=>{
 const st=storage();
 assert.equal(getTomTomKey(st),'');
 assert.equal(setTomTomKey(' test-api-key ',st),true);
 assert.equal(getTomTomKey(st),'test-api-key');
 assert.deepEqual(st.entries(),[['kondate.tomtom-api-key.v1','test-api-key']]);
 assert.equal(setTomTomKey('',st),false);
 assert.equal(getTomTomKey(st),'');
});
test('TomTom response normalizes title and addresses, excludes actions and duplicates',()=>{
 const got=normalizeTomTomSuggestions({results:[
  {id:'a',type:'poi',title:'松屋 津田沼店',subtitles:['千葉県習志野市津田沼1丁目10-41','日本']},
  {id:'b',type:'poi',title:'松屋',subtitles:['茨城県ひたちなか市津田3378-3','日本']},
  {id:'a',type:'poi',title:'松屋 津田沼店',subtitles:['千葉県習志野市津田沼1丁目10-41','日本']},
  {type:'discoverAction',title:'松屋の店舗を表示'},
  {type:'area',title:'津田沼',address:{countrySubdivision:'千葉県',municipality:'習志野市'}},
 ]});
 assert.equal(got.length,3);
 assert.equal(got[0].name,'松屋 津田沼店');
 assert.match(got[0].detail,/千葉県習志野市/);
 assert.match(got[1].value,/ひたちなか市/);
 assert.equal(got[0].source,'tomtom');
 assert.match(got[2].detail,/習志野市/);
});
test('Suggest uses documented POST endpoint and Japanese response headers without a fixed location',async()=>{
 const controller=new AbortController(),calls=[];
 const places=await searchTomTomPlaces('松屋 つだ',{
  apiKey:'test-key',signal:controller.signal,fetcher:async(url,opt)=>{
   calls.push({url,opt});
   return {ok:true,json:async()=>({results:[{type:'poi',title:'松屋 津田沼店',subtitles:['習志野市津田沼']}]})};
  }
 });
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.tomtom.com/maps/orbis/places/suggest');
 assert.equal(calls[0].opt.method,'POST');
 assert.equal(calls[0].opt.signal,controller.signal);
 assert.equal(calls[0].opt.headers['TomTom-Api-Key'],'test-key');
 assert.equal(calls[0].opt.headers['TomTom-Api-Version'],'3');
 assert.equal(calls[0].opt.headers.Attributes,'results');
 assert.match(calls[0].opt.headers['Accept-Language'],/ja/);
 assert.deepEqual(JSON.parse(calls[0].opt.body),{query:'松屋 つだ',maxResults:10});
 assert.equal(places[0].name,'松屋 津田沼店');
});
test('No key is sent, restricted keys fail safely, and free-plan limits are reported',async()=>{
 await assert.rejects(searchTomTomPlaces('松屋',{apiKey:'',fetcher:()=>{throw Error('must not call');}}),/未設定/);
 for(const [status,expected] of [[403,'APIキー'],[429,'無料プラン'],[500,'接続できません']]){
  await assert.rejects(searchTomTomPlaces('松屋',{apiKey:'key',fetcher:async()=>({ok:false,status})}),new RegExp(expected));
 }
});
