import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {presetCalendarIds,isPresetEvent,presetIcon,matchingPresetEvent,presetEventPayload} from '../src/icon-presets.js';
const date='2026-10-10';
const old={id:'old',keyword:'可燃ごみ',icon:'🗑️'};
const a={id:'aaa',keyword:'ごみ回収',memo:'A地区',icon:'🗑️',calendarId:'calendar'};
const b={id:'bbb',keyword:'ごみ回収',memo:'B地区',icon:'♻️',calendarId:'calendar'};
const e=rule=>({...presetEventPayload(date,rule),id:rule.id,etag:'etag'});
test('legacy icon mappings work and only configured calendars are loaded',()=>{
 assert.deepEqual(presetCalendarIds([old,a,b]),['calendar']);
 assert.equal(presetIcon({summary:'可燃ごみの日'},'calendar',[old]),'🗑️');
 assert.equal(isPresetEvent({summary:'適当な料理',start:{date}},'calendar',[old,a]),false);
});
test('same title distinct memo and calendar precisely identifies separate events',()=>{
 const eventA=e(a),eventB=e(b);
 assert.equal(eventA.summary,eventB.summary);
 assert.equal(eventA.description,'A地区');
 assert.equal(presetIcon(eventA,'calendar',[a,b]),'🗑️');
 assert.equal(presetIcon(eventB,'calendar',[a,b]),'♻️');
 assert.equal(matchingPresetEvent([eventB],'calendar',date,a),undefined);
 assert.equal(matchingPresetEvent([eventA,eventB],'calendar',date,b)?.id,'bbb');
 assert.equal(matchingPresetEvent([eventA],'other',date,a),undefined);
 assert.equal(matchingPresetEvent([eventA],'calendar','2026-10-11',a),undefined);
});
test('toggle does not target timed or recurring events',()=>{
 const event=e(a);
 assert.equal(matchingPresetEvent([{...event,recurringEventId:'series'}],'calendar',date,a),undefined);
 assert.equal(matchingPresetEvent([{...event,start:{dateTime:'2026-10-10T09:00:00+09:00'}}],'calendar',date,a),undefined);
 assert.equal(isPresetEvent(event,'calendar',[a,b]),true);
 assert.equal(event.end.date,'2026-10-11');
 assert.equal(event.extendedProperties.private.kondatePresetId,'aaa');
});
test('toolbar, handlers, and clipping CSS are wired',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="quick-preset-bar"')>html.indexOf('id="main"'));
 assert.ok(html.indexOf('id="quick-preset-bar"')<html.indexOf('id="status-bar"'));
 assert.match(app,/if\(selectedPresetId\)\{selected=date;await togglePresetOnDate\(date\);return;\}/);
 assert.match(app,/matchingPresetEvent\(current,calendarId,date,rule\)/);
 assert.match(app,/api\.removePreset/);
 assert.match(app,/api\.insertPreset/);
 assert.match(app,/data-icon-memo/);
 assert.match(app,/data-icon-calendar/);
 assert.match(css,/\.month-grid \.event-chip \.calendar-event-note\{[^}]*text-overflow:clip/);
 for(const path of ['src/app.js','src/google.js','src/icon-presets.js']){
  const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});
