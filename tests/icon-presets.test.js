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
 assert.equal(normalizeIconColor('red;bad'),'#ffffff');
 assert.equal(normalizeIconColor(undefined),'#ffffff');
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
test('all calendar chips are rendered and clipped naturally, with centered icons',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.match(app,/\$\{chips\.join\(''\)\}/);
 assert.doesNotMatch(app,/chips\.slice\(0,2\)|chips\.length>2/);
 assert.match(css,/\.month-grid \.day \.event-chip\{flex:0 0 auto\}/);
 assert.match(css,/\.month-grid \.event-chip\.general-event\.has-icon\{align-items:center\}/);
 assert.match(css,/\.calendar-event-icon:has\(\.preset-svg-icon\.is-white\)/);
 assert.match(app,/beginPresetEdit\(original,uid\(\)\.slice\(0,10\)\)/);
 assert.match(app,/is-white/);
});
test('calendar preserves its nodes, inset focus, and pending opacity instead of dashed lines',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.match(app,/renderedViewTab==='calendar'&&renderedCalendarMonth===monthKey/);
 assert.match(app,/patchCalendarCells\(\)/);
 assert.match(app,/day\.innerHTML!==cell\.html/);
 assert.match(app,/previous\[i\]\.outerHTML!==desired\[i\]\.outerHTML/);
 assert.match(app,/if\(bar\.innerHTML!==nextMarkup\)bar\.innerHTML=nextMarkup/);
 assert.doesNotMatch(app,/\.day\[data-date="\$\{date\}"\]\x60\)\?\.focus/);
 assert.match(css,/#main \.month-grid \.day:focus-visible\{outline:2px solid var\(--accent\);outline-offset:-2px\}/);
 assert.match(css,/#main \.month-grid \.event-chip\.general-event\.is-pending\{border-bottom:0;opacity:\.55\}/);
});
test('toolbar, handlers, and clipping CSS are wired',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="quick-preset-bar"')>html.indexOf('id="main"'));
 assert.ok(html.indexOf('id="quick-preset-bar"')<html.indexOf('id="status-bar"'));
 assert.match(app,/if\(selectedPresetId\)\{selected=date;togglePresetOnDate\(date\);return;\}/);
 assert.match(app,/matchingPresetEvent\(\[e\],calendarId,entry\.date,entry\.rule\)/);
 assert.match(app,/api\.batchPresetChanges/);
 assert.match(app,/presetQueue\.toggle\(rule,date/);
 assert.match(app,/PRESET_FLUSH_INTERVAL_MS/);
 assert.match(html,/id="preset-pending"/);
 assert.match(app,/id="preset-edit-memo"/);
 assert.match(app,/data-action="choose-icon"/);
 assert.match(app,/data-action="open-icon-picker"/);
 assert.match(app,/modal\('アイコンを選択'/);
 assert.doesNotMatch(app.match(/function additionalCalendarSettings\(\)\{[\s\S]*?\n\}/)?.[0]||'',/icon-tile-grid/);
 assert.match(app,/class="icon-tile/);
 assert.match(app,/id="preset-edit-color"/);
 assert.match(css,/mask-image:var\(--preset-svg\)/);
 assert.match(css,/\.preset-svg-icon::before\{content:'';position:absolute;inset:0;display:block/);
 assert.match(css,/\.preset-svg-icon\{[\s\S]*?filter:drop-shadow\(/);
 assert.match(css,/\.preset-svg-icon\.is-white\{--preset-icon-edge:/);
 assert.match(css,/\.dialog-body \.icon-tile-grid\{display:grid/);
 assert.match(app,/id="preset-edit-calendar"/);
 assert.match(css,/\.month-grid \.event-chip \.calendar-event-note\{[^}]*text-overflow:clip/);
 for(const path of ['src/app.js','src/google.js','src/icon-presets.js','src/preset-queue.js']){
  const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
 }
});

test('new calendar option opens a modal and automatically selects created calendar',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/NEW_CALENDAR_VALUE='__kondate_create_calendar__'/);
 assert.match(app,/<option value="\$\{NEW_CALENDAR_VALUE\}">＋ 新規作成…<\/option>/);
 assert.match(app,/function openCalendarCreation\(ruleId\)/);
 assert.match(app,/id="new-calendar-name"/);
 assert.match(app,/id="new-calendar-description"/);
 assert.match(app,/id="new-calendar-timezone"/);
 assert.match(app,/const permission=api\.authorizeCalendarCreation\(GOOGLE_CLIENT_ID\)/);
 assert.match(app,/api\.createCalendar\(input,await permission\)/);
 assert.match(app,/rule\.calendarId=created\.id/);
 assert.match(app,/el\.value=presetEditDraft\?\.calendarId\|\|''/);
 assert.match(app,/found\.find\(c=>c\.id===calendar\.id\)\|\|calendar/);
});

test('editing an icon color updates its SVG preview immediately',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const preview=app.slice(app.indexOf('function updatePresetEditorIconPreview(){'),app.indexOf('function openPresetEditor('));
 assert.match(preview,/presetEditDraft\.color=tint/);
 assert.match(preview,/icon\.style\.color=tint/);
 assert.match(preview,/icon\.classList\.toggle\('is-white'/);
 assert.match(app,/if\(el\.id==='preset-edit-color'\)\{updatePresetEditorIconPreview\(\);return;\}/);
 assert.match(app,/if\(el\.id==='preset-edit-color'\)updatePresetEditorIconPreview\(\);/);
});
test('preset toolbar skips unset destination calendars and hides when there are none',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const bar=app.slice(app.indexOf('function renderPresetBar(){'),app.indexOf('function prepareGoogleIdentity(){'));
 assert.match(bar,/rule\.keyword\|\|''\)\.trim\(\)\&\&String\(rule\.calendarId\|\|''\)\.trim\(\)/);
 assert.match(bar,/const shown=tab==='calendar'&&rules\.length>0/);
 assert.match(bar,/if\(!rules\.some\(rule=>rule\.id===selectedPresetId\)\)selectedPresetId=null/);
 assert.match(bar,/bar\.hidden=!shown/);
});
test('preset list is a single row and editor is transactional',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const list=app.slice(app.indexOf('function additionalCalendarSettings(){'),app.indexOf('function capturePresetEditorFields(){'));
 assert.match(list,/class="icon-preset-row"/);
 assert.match(list,/class="preset-row-icon"/);
 assert.match(list,/class="preset-row-memo/);
 // The generic .empty class applies 150px minimum height and padding.
 assert.match(list,/memo\?'':'no-memo'/);
 assert.doesNotMatch(list,/memo\?'':'empty'/);
 assert.match(css,/\.icon-preset-row \.preset-row-memo\.no-memo\{color:var\(--muted\)\}/);
 assert.match(list,/button\('編集','edit-icon-rule'/);
 assert.match(list,/button\('削除','remove-icon-rule'/);
 assert.doesNotMatch(list,/<textarea|<select data-icon-calendar|data-icon-keyword/);
 assert.match(app,/'add-icon-rule':\(\)=>openPresetEditor\(\)/);
 assert.match(app,/'edit-icon-rule':b=>openPresetEditor\(b\.dataset\.ruleId\)/);
 assert.match(app,/'save-preset-editor':async\(\)=>\{/);
 assert.match(app,/const rule=commitPresetEdit\(presetEditDraft\)/);
 assert.match(app,/else state\.iconRules\.push\(rule\)/);
 assert.match(app,/presetEditDraft=null;presetEditOriginalId=null/);
 assert.match(app,/rule\.calendarId=created\.id/);
 assert.match(css,/\.icon-preset-row\{display:flex;align-items:center/);
 assert.match(css,/\.preset-row-memo\{flex:1 1 0/);
});

test('preset icon outline follows the SVG silhouette in the calendar, toolbar and editor',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const iconCss=css.slice(css.indexOf('/* The outer span stays unmasked:'),css.indexOf('.quick-preset .preset-svg-icon'));
 const outline=iconCss.slice(iconCss.indexOf('.preset-svg-icon{'),iconCss.indexOf('.preset-svg-icon.is-white'));
 assert.match(outline,/filter:drop-shadow\(/);
 assert.equal((outline.match(/drop-shadow\(/g)||[]).length,4);
 assert.doesNotMatch(outline,/mask-image:/); // no clipping of outline
 assert.match(iconCss,/\.preset-svg-icon::before\{[^}]*-webkit-mask-image:var\(--preset-svg\);mask-image:var\(--preset-svg\)/);
 assert.match(iconCss,/\.preset-svg-icon\.is-white\{--preset-icon-edge:/);
 assert.match(app,/class="preset-svg-icon \$\{extraClass\}/);
 for(const target of ['.quick-preset .preset-svg-icon','.icon-tile .preset-svg-icon','.icon-picker-trigger .preset-svg-icon','.calendar-event-icon .preset-svg-icon'])
  assert.ok(css.includes(target),target);
});
