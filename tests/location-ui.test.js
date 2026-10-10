import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('record registration and editing show an optional Google Calendar location input',()=>{
 const draw=app.slice(app.indexOf('function openRecord('),app.indexOf('async function saveRecord()'));
 assert.match(draw,/id="record-location"/);
 assert.match(draw,/value="\$\{esc\(editor\.location\|\|''\)\}"/);
 assert.match(draw,/外食/);
 assert.match(draw,/editor\.location\?\?=editor\.raw\?\.location/);
});
test('location changes persist in editor without blur and are included on save',()=>{
 assert.match(app,/if\(editor&&\(el\.id==='record-location'\|\|el\.id==='place-search-active'\)\)\{/);
 assert.match(app,/editor\.location=el\.value/);
 assert.match(app,/queuePlaceLookup\(el\)/);
 assert.match(app,/if\(el\.id==='record-location'\)editor\.location=el\.value/);
 assert.match(app,/current\.location=String\(current\.location\|\|''\)\.trim\(\)/);
 assert.match(app,/外食・場所：\$\{esc\(r\.location\)\}/);
});
test('browser app remains valid JavaScript',()=>{
 const result=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('one-field location typeahead is region-neutral and keeps candidates inline',()=>{
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 const dialog=app.slice(app.indexOf('function drawRecord(){'),app.indexOf('async function saveRecord()'));
 assert.doesNotMatch(dialog,/id="place-search-area"/);
 assert.doesNotMatch(dialog,/data-action="search-place"/);
 assert.match(dialog,/placeholder="店名・支店名・住所で検索"/);
 assert.doesNotMatch(dialog,/入力すると候補が自動表示されます/);
 assert.doesNotMatch(dialog,/地図データに未登録の店舗は候補に出ません/);
 assert.doesNotMatch(dialog,/class="place-attribution"/);
 assert.match(dialog,/class="place-popup-attribution"/);
 assert.match(dialog,/class="place-sheet-attribution"/);
 const popup=dialog.slice(dialog.indexOf('id="place-popup"'),dialog.indexOf('</div></div><h3>料理'));
 assert.match(popup,/place-popup-attribution/);
 assert.match(popup,/openstreetmap.org\\/copyright/);
 assert.match(css,/#dialog-content #place-search-sheet #place-popup \\.place-popup-attribution\\{display:none\\}/);
 assert.match(dialog,/id="place-search-status"/);
 assert.doesNotMatch(dialog,/placeholder="津田沼"/);
 assert.match(app,/function queuePlaceLookup\(field,\{immediate=false\}=\{\}\)/);
 assert.match(app,/const delay=Math\.max\(immediate\?0:650,1000-/);
 assert.match(css,/#dialog-content #place-popup\{\s*position:fixed/);
 assert.match(css,/#dialog-content #place-suggestions\{[\s\S]*?touch-action:pan-y/);
 assert.match(css,/\.place-field \.place-suggestion small\{[^}]*white-space:normal/);
});

test('place suggestions are portaled outside the scrolling form and selected only on click',()=>{
 const dialog=app.slice(app.indexOf('function drawRecord(){'),app.indexOf('async function saveRecord()'));
 const gestures=app.slice(app.indexOf("document.addEventListener('pointerdown',e=>"),app.indexOf("document.addEventListener('pointermove',e=>"));
 assert.match(dialog,/id="place-popup"/);
 assert.match(dialog,/\$\('#dialog-content'\)\.appendChild\(popup\)/);
 assert.match(app,/function positionPlaceSuggestions\(\)/);
 assert.match(app,/globalThis\.visualViewport\?\.addEventListener\('resize',positionPlaceSuggestions\)/);
 assert.doesNotMatch(gestures,/pickPlaceSuggestion\(/);
 assert.match(app,/'pick-location':pickPlaceSuggestion/);
});

test('typeahead filters cached Photon candidates before the network returns',()=>{
 assert.match(app,/placeCandidatePool=new Map\(\)/);
 assert.match(app,/const seeded=filterPlaceCandidates\(\[\.\.\.placeCandidatePool\.values\(\)\],query\)/);
 assert.match(app,/onCandidates:batch=>\{/);
 assert.match(app,/rememberPlaceCandidates\(batch\)/);
 assert.match(app,/seed:\[\.\.\.placeCandidatePool\.values\(\)\]/);
 assert.match(app,/filterPlaceCandidates/);
});

test('mobile location search fixes the search field at visual viewport top with scrollable results beneath',()=>{
 const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
 assert.match(app,/function openPlaceSearchSheet\(\)/);
 assert.match(app,/function closePlaceSearchSheet\(\)/);
 assert.match(app,/sheet\.querySelector\('\.place-sheet-results'\)\.appendChild\(popup\)/);
 assert.match(app,/sheet\.style\.top=Math\.round\(viewport\?\.offsetTop\?\?0\)/);
 assert.match(app,/sheet\.style\.height=Math\.round\(viewport\?\.height\?\?innerHeight\)/);
 assert.match(app,/input\.focus\(\{preventScroll:true\}\)/);
 assert.match(app,/if\(matchMedia\('\(max-width:760px\)'\)\.matches\)\{openPlaceSearchSheet\(\);return;\}/);
 assert.match(css,/#dialog-content #place-search-sheet\{[\s\S]*?position:fixed/);
 assert.match(css,/#dialog-content #place-search-sheet #place-suggestions\{[\s\S]*?overflow-y:auto/);
 assert.match(css,/#dialog-content #place-search-sheet #place-popup\{\s*position:static!important/);
 assert.match(css,/#dialog-content #place-search-sheet\[hidden\]\{display:none\}/);
 assert.doesNotMatch(app,/const placeBelow=/);
});
test('place candidates synchronize selection into the actual calendar editor',()=>{
 assert.match(app,/field\.value=name;if\(original\)original\.value=name;editor\.location=name/);
 assert.match(app,/'close-place-search':\(\)=>closePlaceSearchSheet\(\)/);
 assert.match(app,/if\(editor&&\(el\.id==='record-location'\|\|el\.id==='place-search-active'\)\)/);
 assert.match(app,/function closePlaceSearchSheet\(\)/);
});
