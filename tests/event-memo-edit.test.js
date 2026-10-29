import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {renderDayDetail} from '../src/day-detail.js';
import {CalendarClient} from '../src/google.js';
import {matchingPresetEvent} from '../src/icon-presets.js';
import {PresetWriteQueue} from '../src/preset-queue.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,action,cls,attrs='')=>'<button data-action="'+action+'" class="'+cls+'" '+attrs+'>'+label+'</button>';
const date='2026-10-29',calendarId='own-cal';
const sample=(id,memo,editable=true)=>({id,calendarId,date,title:id,memo,icon:'star_fill',color:'#fff',editable});
const detail=(events,editingMemo=null)=>renderDayDetail({date,otherEvents:events,editingMemo,records:[],esc,button,iconMarkup:()=>'<svg></svg>',categoryName:x=>x});

test('editable appointments show a memo action; read-only and pending do not',()=>{
 const html=detail([sample('editable',''),sample('readonly','',false)]);
 assert.equal((html.match(/data-action="edit-event-memo"/g)||[]).length,1);
 assert.match(html,/data-id="editable" data-calendar="own-cal" data-date="2026-10-29"/);
 assert.doesNotMatch(html,/data-id="readonly"/);
});
test('inline memo editor permits empty values and orders memo entries first',()=>{
 const data=[sample('no-memo',''),sample('has-memo','持参する')];
 const html=detail(data,{id:'no-memo',calendarId,date,value:''});
 assert.ok(html.indexOf('title="has-memo ／ 持参する"')<html.indexOf('title="no-memo"'));
 assert.match(html,/data-event-memo-input[^>]*maxlength="2000"[^>]*><\/textarea>/);
 assert.match(html,/data-action="save-event-memo"[^>]*>確定<\/button>/);
 assert.match(html,/data-action="cancel-event-memo"/);
 const swapped=detail([sample('A','メモ'),sample('B',''),sample('C','メモ')]);
 assert.ok(swapped.indexOf('title="A ／ メモ"')<swapped.indexOf('title="C ／ メモ"'));
 assert.ok(swapped.indexOf('title="C ／ メモ"')<swapped.indexOf('title="B"'));
});

function harness({memo='最初のメモ',role='writer',isPreset=false}={}){
 const item={id:'event-A',etag:'etag-1',summary:'可燃ごみ',description:memo,start:{date},
  extendedProperties:{private:isPreset?{kondatePreset:'1',existingKey:'preserve'}:{}}};
 const bucket={events:[item]},calls=[],rendered=[],messages=[];
 const rule={id:'rule-1',calendarId,keyword:'可燃ごみ',memo:'最初のメモ',icon:'delete_2_fill'};
 const ctx={
  state:{iconRules:isPreset?[rule]:[]},calendars:[{id:calendarId,accessRole:role}],
  api:{connected:true,async patchEvent(cal,e,patch){
   calls.push({cal,e,patch});return {...e,...patch,etag:'etag-2'};
  }},
  extraEvents:()=>[sample('event-A',memo,role==='writer')],
  dataFor:()=>bucket,
  matchesPreset:(e,cal,r)=>r.calendarId===cal&&e.summary===r.keyword&&e.description===r.memo,
  isPresetEvent:(e)=>e.extendedProperties?.private?.kondatePreset==='1',
  render:()=>rendered.push('render'),$:()=>({open:false}),
  updateConnection:()=>{},notify:msg=>messages.push(msg)
 };
 const src=app.slice(app.indexOf('function refreshEventMemoEditor(){'),app.indexOf('function generationModeButtons(){'));
 assert.match(src,/async function saveEventMemo\(button\)/);
 const api=runInNewContext('(function(){let editingEventMemo=null,busy=false;'+
  'const {state,calendars,api,extraEvents,dataFor,matchesPreset,isPresetEvent,render,$,updateConnection,notify}=deps;\n'+
  src+'return {openEventMemoEditor,saveEventMemo,get draft(){return editingEventMemo;}};})()',{deps:ctx});
 const openButton={dataset:{calendar:calendarId,id:'event-A',date}};
 const saveButton=value=>({dataset:{calendar:calendarId,id:'event-A'},disabled:false,
  closest:()=>({querySelector:()=>({value})})});
 return {api,ctx,bucket,item,rule,calls,rendered,messages,openButton,saveButton};
}
test('saving an empty memo PATCHes the original event, clears local cache and re-renders',async()=>{
 const h=harness();h.api.openEventMemoEditor(h.openButton);
 assert.equal(h.api.draft.value,'最初のメモ');
 await h.api.saveEventMemo(h.saveButton(''));
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].cal,calendarId);
 assert.equal(h.calls[0].e.id,'event-A');
 assert.equal(h.calls[0].patch.description,'');
 assert.deepEqual(Object.keys(h.calls[0].patch),['description']);
 assert.equal(h.bucket.events[0].description,'');
 assert.equal(h.api.draft,null);
 assert.ok(h.rendered.length>=2);
 assert.match(h.messages.at(-1),/更新しました/);
});
test('read-only events cannot be edited, and failure preserves the draft',async()=>{
 const h=harness({role:'reader'});
 assert.throws(()=>h.api.openEventMemoEditor(h.openButton),/編集できません/);
 const h2=harness();h2.api.openEventMemoEditor(h2.openButton);
 h2.ctx.api.connected=false;
 await assert.rejects(()=>h2.api.saveEventMemo(h2.saveButton('新メモ')),/接続/);
 assert.equal(h2.api.draft.value,'新メモ');
 assert.equal(h2.bucket.events[0].description,'最初のメモ');
});
test('edited preset keeps stable ID association and toggles off rather than duplicating',async()=>{
 const h=harness({isPreset:true});h.api.openEventMemoEditor(h.openButton);
 await h.api.saveEventMemo(h.saveButton(''));
 assert.equal(h.calls[0].patch.extendedProperties.private.kondatePresetId,'rule-1');
 assert.equal(h.calls[0].patch.extendedProperties.private.existingKey,'preserve');
 const saved=h.bucket.events[0];
 assert.equal(matchingPresetEvent([saved],calendarId,date,h.rule)?.id,'event-A');
 const stored=new Map(),storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 const queue=new PresetWriteQueue(storage,()=> '0123456789abcdef0123456789abcdef');
 assert.deepEqual(queue.toggle(h.rule,date,[saved]),{present:false,count:1});
 assert.equal(queue.project(calendarId,[saved]).length,0);
});
test('Google Calendar PATCH uses ETag and explicitly accepts empty description',async()=>{
 const sent=[];
 const client=new CalendarClient(async(url,init)=>{
  sent.push({url,init});
  return new Response(JSON.stringify({id:'event-A',description:''}),{status:200,headers:{'Content-Type':'application/json'}});
 });
 client.token='test';client.expires=Date.now()+120000;
 await client.patchEvent(calendarId,{id:'event-A',etag:'"revision"'},{description:''});
 assert.equal(sent.length,1);
 assert.match(sent[0].url,/\/calendars\/own-cal\/events\/event-A$/);
 assert.equal(sent[0].init.method,'PATCH');
 assert.equal(sent[0].init.headers['If-Match'],'"revision"');
 assert.equal(JSON.parse(sent[0].init.body).description,'');
});
test('memo controls fit small iPhone screens and stay wired',()=>{
 assert.match(css,/\.day-event-memo-editor textarea\{[\s\S]*?font-size:16px/);
 assert.match(css,/\.day-event-memo-actions\{display:flex/);
 assert.match(app,/'save-event-memo':saveEventMemo/);
 assert.match(app,/'cancel-event-memo':/);
 assert.match(app,/editingMemo:editingEventMemo,categoryName/);
 assert.match(app,/editable=api\.connected&&!busy/);
});
