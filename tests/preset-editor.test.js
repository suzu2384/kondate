import test from 'node:test';
import assert from 'node:assert/strict';
import {beginPresetEdit,commitPresetEdit} from '../src/preset-editor.js';

test('new preset is only a draft and requires a title to be committed',()=>{
 const draft=beginPresetEdit(null,'1234567890');
 assert.deepEqual(draft,{id:'1234567890',keyword:'',memo:'',calendarId:'',icon:'tag_fill',color:'#ffffff'});
 assert.throws(()=>commitPresetEdit(draft),/タイトル/);
 draft.keyword='  家族の予定  ';
 draft.memo='A地区';
 const finished=commitPresetEdit(draft);
 assert.equal(finished.keyword,'家族の予定');
 assert.equal(finished.memo,'A地区');
 assert.equal(finished.id,'1234567890');
});
test('editing uses a copy; choosing icon, changing memo and cancel do not affect original',()=>{
 const saved={id:'abcdef0123',keyword:'予定',memo:'A',calendarId:'calA',icon:'car_fill',color:'#FF0000'};
 const draft=beginPresetEdit(saved,'unused');
 draft.memo='B';draft.calendarId='calB';draft.icon='star_fill';
 assert.equal(saved.memo,'A');
 assert.equal(saved.calendarId,'calA');
 assert.equal(saved.icon,'car_fill');
 assert.deepEqual(commitPresetEdit(draft),{...saved,memo:'B',calendarId:'calB',icon:'star_fill'});
});
test('draft preserves selected newly-created Google calendar until commit',()=>{
 const saved={id:'abcdef0123',keyword:'休み',memo:'',calendarId:''};
 const draft=beginPresetEdit(saved,'unused');
 draft.calendarId='created@group.calendar.google.com';
 assert.equal(saved.calendarId,'');
 assert.equal(commitPresetEdit(draft).calendarId,'created@group.calendar.google.com');
});
test('memo limits and blank title rejected without touching saved preset',()=>{
 const draft=beginPresetEdit({id:'abcdef0123',keyword:'ok',memo:''},'unused');
 draft.keyword=' ';
 assert.throws(()=>commitPresetEdit(draft),/タイトル/);
 draft.keyword='ok';draft.memo='X'.repeat(2001);
 assert.throws(()=>commitPresetEdit(draft),/メモ/);
});
