import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const record=source.slice(source.indexOf('function openRecord('),source.indexOf('async function saveRecord(){'));
test('photo tab has been retired; calendar record editor remains available',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/data-tab="photo"|>記録<\/button>/);
 assert.match(html,/data-tab="shopping"/);
 assert.doesNotMatch(source,/function photoScreen\(\)/);
 assert.match(source,/function openRecord\(/);
});
test('record creation no longer offers draft resume or recovery prompts',()=>{
 assert.match(record,/editor=record\?structuredClone\(record\):/);
 assert.match(record,/drawRecord\(\)/);
 assert.match(record,/閉じると未保存の入力は破棄されます/);
 assert.doesNotMatch(source,/resume-record|discard-record|pendingRecord|saveEditor\(\)|state\.recordDraft/);
});
