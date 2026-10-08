import test from 'node:test';
import assert from 'node:assert/strict';
import {readState,saveState,storedState} from '../src/storage.js';

test('calendar events and local acceptance decisions never persist to device storage',()=>{
 const previousStorage=globalThis.localStorage;
 let saved='';
 globalThis.localStorage={getItem:()=>saved,setItem:(k,v)=>{saved=v;}};
 try{
  const data={theme:{color:'green'},calendarId:'meal',recordDraft:{date:'2026-10-09'},draft:[{dishes:[]}],scopes:{'oauth|meal':{events:[{id:'cloud',summary:'secret meal'}],legacy:{cloud:{accepted:true}},lastSync:42,aliases:{gyoza:'餃子'},manual:[{name:'例'}],metadata:{}}}};
  assert.equal(saveState(data),true);
  assert.doesNotMatch(saved,/secret meal|accepted|recordDraft|2026-10-09/);
  const read=readState();
  assert.deepEqual(read.scopes['oauth|meal'].events,[]);
  assert.deepEqual(read.scopes['oauth|meal'].legacy,{});
  assert.equal(read.scopes['oauth|meal'].lastSync,null);
  assert.equal(read.recordDraft,undefined);
  assert.equal(read.scopes['oauth|meal'].aliases.gyoza,'餃子');
  assert.equal(data.scopes['oauth|meal'].events[0].id,'cloud','in-memory working set is unchanged');
 }finally{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;}
});
test('existing locally cached calendar history is discarded on load',()=>{
 const previousStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>JSON.stringify({scopes:{scope:{events:[{id:'old'}],legacy:{old:{accepted:true}},lastSync:100,aliases:{a:'b'},metadata:{},manual:[]}}})};
 try{
  const loaded=readState();
  assert.deepEqual(loaded.scopes.scope.events,[]);
  assert.deepEqual(loaded.scopes.scope.legacy,{});
  assert.equal(loaded.scopes.scope.aliases.a,'b');
  assert.deepEqual(storedState(loaded).scopes.scope.events,[]);
 }finally{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;}
});

test('a legacy record draft is discarded but generated menu candidates remain',()=>{
 const old=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>JSON.stringify({recordDraft:{date:'2026-10-09',dishes:[{name:'unfinished'}]},draft:[{dishes:[{name:'planned'}]}],scopes:{}})};
 try{
  const state=readState();
  assert.equal(state.recordDraft,undefined);
  assert.equal(state.draft[0].dishes[0].name,'planned');
 }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
