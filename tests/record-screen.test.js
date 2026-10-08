import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const photo=source.slice(source.indexOf('function photoScreen(){'),source.indexOf('function rulesFields(){'));
const record=source.slice(source.indexOf('function openRecord('),source.indexOf('async function saveRecord(){'));
test('photo selection presents the OS image picker without a redundant camera button',()=>{
 assert.match(photo,/data-action="pick-photo"/);
 assert.match(photo,/id="photo-file" accept="image\/\*"/);
 assert.doesNotMatch(photo,/カメラを起動|camera-file|capture="environment"/);
 assert.doesNotMatch(source,/camera:\(\)=>|camera-file/);
});
test('record creation no longer offers draft resume or recovery prompts',()=>{
 assert.match(record,/editor=record\?structuredClone\(record\):/);
 assert.match(record,/drawRecord\(\)/);
 assert.match(record,/閉じると未保存の入力は破棄されます/);
 assert.doesNotMatch(source,/resume-record|discard-record|pendingRecord|saveEditor\(\)|state\.recordDraft/);
});
