import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {presetCalendarIds,isPresetEvent,presetIcon,matchingPresetEvent,presetEventPayload} from '../src/icon-presets.js';
const date='2026-10-10';
const old={id:'old',keyword:'可燃ごみ',icon:'🗑️'};
const a={id:'aaa',keyword:'ごみ回収',memo:'A地区',icon:'🗑️',calendarId:'calendar'};
const b={id:'bbb',keyword:'ごみ回収',memo:'B地区',icon:'♻️',calendarId:'calendar'};
const e=rule=>({...presetEventPayload(date,rule),id:rule.id,etag:'etag'});
import {ICON_CHOICES,normalizeIcon,normalizeIconColor} from '../src/calendar-display.js';
test('thirty user-provided MingCute Solid SVGs are included, old assets removed',()=>{
 assert.equal(ICON_CHOICES.length,30);
 assert.equal(new Set(ICON_CHOICES).size,30);
 for(const icon of ICON_CHOICES){
  const svg=readFileSync(new URL('../icons/presets/'+icon+'.svg',import.meta.url),'utf8');
  assert.match(svg,/viewBox="0 0 24 24"/);
  assert.match(svg,/<path fill="#000000" d="/);
 }
 for(const oldIcon of ["pin","trash","recycle","school","hospital","cake","briefcase-business","sport-shoe","shopping-cart","party-popper","car","tram-front","plane","pill"]){
  assert.equal(existsSync(new URL('../icons/presets/'+oldIcon+'.svg',import.meta.url)),false);
 }
 assert.equal(normalizeIcon('📌'),'flag_3_fill');
 assert.equal(normalizeIcon('🏃'),'fitness_fill');
 assert.equal(normalizeIcon('🛍️'),'shopping_cart_2_fill');
 assert.equal(normalizeIcon('⭐'),'star_fill');
 assert.equal(normalizeIcon('trash'),'tag_fill');
 assert.equal(normalizeIconColor('#FF4477'),'#FF4477');
 assert.equal(normalizeIconColor('red;bad'),'#436e57');
});
test('legacy icon mappings work and only configured calendars are loaded',()=>{
 assert.deepEqual(presetCalendarIds([old,a,b]),['calendar']);
 assert.equal(presetIcon({summary:'可燃ごみの日'},'calendar',[old]),'tag_fill');
 assert.equal(isPresetEvent({summary:'適当な料理',start:{date}},'calendar',[old,a]),false);
});
test('same title distinct memo and calendar precisely identifies separate events',()=>{
 const eventA=e(a),eventB=e(b);
 assert.equal(eventA.summary,eventB.summary);
 assert.equal(eventA.description,'A地区');
 assert.equal(presetIcon(eventA,'calendar',[a,b]),'tag_fill');
 assert.equal(presetIcon(eventB,'calendar',[a,b]),'leaf_3_fill');
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
 assert.match(app,/data-action="choose-icon"/);
 assert.match(app,/data-action="open-icon-picker"/);
 assert.match(app,/modal\('アイコンを選択'/);
 assert.doesNotMatch(app.match(/function additionalCalendarSettings\(\)\{[\s\S]*?\n\}/)?.[0]||'',/icon-tile-grid/);
 assert.match(app,/class="icon-tile/);
 assert.match(app,/data-icon-color/);
 assert.match(css,/mask-image:var\(--preset-svg\)/);
 assert.match(css,/\.dialog-body \.icon-tile-grid\{display:grid/);
 assert.match(app,/data-icon-calendar/);
 assert.match(css,/\.month-grid \.event-chip \.calendar-event-note\{[^}]*text-overflow:clip/);
 for(const path of ['src/app.js','src/google.js','src/icon-presets.js']){
  const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});
