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
import {ICON_CHOICES,normalizeIcon,normalizeIconColor,isSupportedIcon} from '../src/calendar-display.js';
test('45 MingCute Filled preset SVGs are available without losing prior icons',()=>{
 assert.equal(ICON_CHOICES.length,45);
 assert.equal(new Set(ICON_CHOICES).size,45);
 for(const icon of ICON_CHOICES){
  const svg=readFileSync(new URL('../icons/presets/'+icon+'.svg',import.meta.url),'utf8');
  assert.match(svg,/viewBox="0 0 24 24"/);
  assert.match(svg,/<path fill="#000000"(?: fill-rule="evenodd")? d="/);
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
 assert.doesNotMatch(css,/\.preset-svg-icon\.is-white|:has\([^)]*is-white/);
 assert.match(app,/beginPresetEdit\(original,uid\(\)\.slice\(0,10\)\)/);
 assert.doesNotMatch(app,/is-white/);
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
 assert.ok(css.includes('mask:var(--preset-svg) center / contain no-repeat'));
 assert.ok(css.includes('stroke-width:1.6'));
 assert.ok(css.includes('paint-order:stroke fill'));
 assert.match(css,/\.preset-svg-icon\{[^}]*--preset-icon-edge:#000\}/);
 assert.doesNotMatch(css,/\.preset-svg-icon\.is-white\{--preset-icon-edge:/);
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
 assert.doesNotMatch(preview,/icon\.classList\.toggle/);
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

test('preset icon outline is an actual SVG path stroke, not multiple drop shadows',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build.js',import.meta.url),'utf8');
 assert.ok(app.includes('const PRESET_ICON_PATHS = /* EMBED_PRESET_ICON_PATHS */ {};'));
 assert.ok(app.includes('<svg class="${cls}"'));
 assert.ok(app.includes('fillRule===\'evenodd\''));
 assert.ok(app.includes('fill-rule="evenodd"'));
 assert.match(css,/\.preset-svg-icon path\{fill:currentColor;stroke:var\(--preset-icon-edge\)/);
 assert.ok(css.includes('stroke-width:1.6'));
 assert.ok(css.includes('paint-order:stroke fill'));
 assert.match(css,/--preset-icon-edge:#000/);
 assert.doesNotMatch(css,/--preset-icon-edge:color-mix/);
 assert.doesNotMatch(css,/\.preset-svg-icon\.is-white\{--preset-icon-edge:/);
 const cssFromSvg=css.slice(css.indexOf('/* v1.3.54: draw'),css.indexOf('.quick-preset .preset-svg-icon'));
 assert.doesNotMatch(cssFromSvg,/drop-shadow/);
 assert.ok(build.includes('icons/presets/${name}.svg'));
 assert.ok(build.includes("source.replace(marker,"));
 for(const target of ['.quick-preset .preset-svg-icon','.icon-tile .preset-svg-icon','.icon-picker-trigger .preset-svg-icon','.calendar-event-icon .preset-svg-icon'])
  assert.ok(css.includes(target),target);
});

test('production build embeds all vector paths without requiring extra HTTP imports',()=>{
 const build=spawnSync(process.execPath,['scripts/build.js'],{encoding:'utf8'});
 assert.equal(build.status,0,build.stderr);
 const result=readFileSync(new URL('../dist/src/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(result,/\/\* EMBED_PRESET_ICON_PATHS \*\//);
 assert.ok(result.includes('const PRESET_ICON_PATHS = {'));
 const block=result.slice(result.indexOf('const PRESET_ICON_PATHS = {'),result.indexOf('function iconMarkup('));
 for(const name of ICON_CHOICES)assert.ok(block.includes(JSON.stringify(name)+':'),name);
 assert.ok(result.includes('<svg class="${cls}"'));
});

test('white preset icon has the same transparent background as other colors',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 // This is a vector outline, not a white-only background workaround.
 assert.match(app,/const cls=`preset-svg-icon \$\{extraClass\}`\.trim\(\)/);
 assert.match(css,/\.preset-svg-icon path\{fill:currentColor;stroke:var\(--preset-icon-edge\)/);
 assert.match(css,/--preset-icon-edge:#000/);
 assert.doesNotMatch(app,/is-white/);
 assert.doesNotMatch(css,/:has\([^}]*is-white/);
 for(const selector of ['.quick-preset', '.icon-picker-trigger', '.icon-tile', '.preset-row-icon']){
  assert.ok(css.includes(selector),`Missing ${selector}`);
 }
});

test('all 15 supplied preset icons preserve their geometry, ordering and evenodd cutouts',()=>{
 const expected=["recycle_fill","delete_2_fill","emoji_fill","folder_fill","birthday_2_fill","teacup_fill","camera_2_fill","film_fill","flower_4_fill","cat_fill","dog_fill","capsule_fill","run_fill","sleep_fill","lock_fill"];
 assert.equal(expected.length,15);
 const oldChoices=["home_2_fill","user_2_fill","briefcase_fill","shopping_cart_2_fill","car_fill","fork_knife_fill","t_shirt_fill","fitness_fill","music_fill","celebrate_fill","heart_fill","star_fill","sparkles_fill","sun_fill","moon_fill","snow_fill","drop_fill","leaf_3_fill","flash_fill","alarm_2_fill","flag_3_fill","tag_fill","currency_cny_fill","thumb_up_2_fill","cross_fill","triangle_fill","square_fill","diamond_fill","clubs_fill","spade_fill"];
 for(const name of oldChoices)assert.ok(ICON_CHOICES.includes(name),name);
 for(const name of expected){
  assert.ok(ICON_CHOICES.includes(name),name);
  assert.equal(normalizeIcon(name),name);
  assert.equal(isSupportedIcon(name),true);
  const source=readFileSync(new URL('../icons/presets/'+name+'.svg',import.meta.url),'utf8');
  assert.match(source,/viewBox="0 0 24 24"/);
  assert.match(source,/<path fill="#000000"/);
  assert.equal((source.match(/<path\b/g)||[]).length,1,name);
 }
 const nearby=(a,b)=>Math.abs(ICON_CHOICES.indexOf(a)-ICON_CHOICES.indexOf(b))<=3;
 for(const [a,b] of [['folder_fill','home_2_fill'],['teacup_fill','fork_knife_fill'],
  ['run_fill','fitness_fill'],['camera_2_fill','film_fill'],
  ['birthday_2_fill','celebrate_fill'],['cat_fill','dog_fill'],
  ['recycle_fill','delete_2_fill']])assert.ok(nearby(a,b),a+' / '+b);
});
test('production vector paths keep evenodd fill rule and black hairline outlines',()=>{
 const source=readFileSync(new URL('../scripts/build.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.match(source,/fill-rule="\(evenodd\|nonzero\)"/);
 assert.match(source,/fillRule==='evenodd'\?\{d,fillRule\}:d/);
 assert.match(app,/path\.fillRule==='evenodd'/);
 assert.match(css,/\.preset-svg-icon path\{fill:currentColor;stroke:var\(--preset-icon-edge\)/);
 assert.match(css,/stroke-width:1\.6/);
 const built=spawnSync(process.execPath,['scripts/build.js'],{encoding:'utf8'});
 assert.equal(built.status,0,built.stderr);
 const dist=readFileSync(new URL('../dist/src/app.js',import.meta.url),'utf8');
 for(const name of ['recycle_fill','cat_fill','emoji_fill','capsule_fill','teacup_fill']){
  const match=dist.match(new RegExp('"'+name+'":\\[\\{"d":'));
  assert.ok(match,name+' must embed its evenodd path');
 }
});

test('preset icon chooser stays six columns on both wide and narrow screens',()=>{
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const wide=css.match(/\.dialog-body \.icon-tile-grid\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\);/);
 assert.ok(wide,'desktop must use six columns');
 const narrow=css.match(/@media\(max-width:420px\)\{[\s\S]*?\.dialog-body \.icon-tile-grid\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\);gap:5px\}/);
 assert.ok(narrow,'small phones must also use six columns');
 assert.doesNotMatch(css,/\.dialog-body \.icon-tile-grid\{grid-template-columns:repeat\(5,/);
 assert.match(css,/\.dialog-body \.icon-tile\{height:42px;min-height:42px;padding:4px\}/);
 assert.match(css,/\.dialog-body \.icon-tile \.preset-svg-icon\{width:25px;height:25px\}/);
});
