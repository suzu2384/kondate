import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_CHROME_COLOR} from '../src/themes.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css');

test('ingredient editor has no confusing used/max counter but still enforces its real limit',()=>{
 const start=app.indexOf('function redrawIngredientRows('),end=app.indexOf('function editPlanDish(',start);
 assert.ok(start>=0&&end>start);
 const master=app.slice(start,end);
 assert.doesNotMatch(master,/master-ingredient-count|件 \/ .*件/);
 assert.match(master,/<strong>材料（1人前）<\/strong>/);
 assert.match(app,/rows.length>=MAX_INGREDIENTS/);
 assert.match(app,/validateIngredients\(readIngredientRows\(\)\)/);
 assert.doesNotMatch(css,/\.master-ingredients-head small/);
});

test('recipe filters occupy the exact shared calendar toolbar row with a full-width separator',()=>{
 const start=app.indexOf('function masterScreen()'),end=app.indexOf('function refreshMasterRows(',start);
 const layout=app.slice(start,end);
 assert.ok(layout.indexOf('class="master-toolbar"')<layout.indexOf('class="master-list-wrap card scroll"'));
 assert.doesNotMatch(layout,/master-filter-bar|data-master-filter/);
 const filterButtons=app.slice(app.indexOf('function masterFilterButtons()'),app.indexOf('function masterScreen()'));
 for(const value of ['献立','買い物','すべて'])assert.ok(filterButtons.includes("filterButton('"+value+"'"));
 const html=read('index.html');
 const main=html.indexOf('<main id="main">');
 const toolbar=html.indexOf('<div id="quick-preset-bar"');
 const status=html.indexOf('<div id="status-bar"');
 assert.ok(main>=0&&main<toolbar&&toolbar<status);
 assert.match(app,/bar\.classList\.toggle\('master-filter-bar',filterBar\)/);
 assert.match(app,/app\.classList\.toggle\('has-master-filters',filterBar\)/);
 assert.match(app,/bar\.setAttribute\('aria-label',masterBar\?'料理の絞り込み'/);
 assert.match(app,/const markup=masterBar\?masterFilterButtons\(\):shoppingFilterButtons\(\)/);
 assert.match(app,/previousMasterFilterScroll=tab==='master'\?\$\('#quick-preset-bar'\)/);
 const calendar=css.match(/\.app\.has-quick-presets\{grid-template-rows:([^}]+)\}/)?.[1];
 const recipes=css.match(/\.app\.has-master-filters\{grid-template-rows:([^}]+)\}/)?.[1];
 assert.equal(recipes,calendar,'Calendar and recipe toolbar must share the exact grid height');
 const bar=css.slice(css.indexOf('/* v1.12.1 —'));
 assert.match(bar,/#quick-preset-bar\.master-filter-bar\{[\s\S]*?border-top:1px solid var\(--line\)/);
 assert.match(bar,/#quick-preset-bar\.master-filter-bar\{[\s\S]*?padding:2px 8px/);
 assert.match(bar,/\.app\.has-master-filters\{grid-template-rows:49px minmax\(0,1fr\) 38px 24px/);
 assert.match(bar,/#quick-preset-bar\.master-filter-bar\{height:38px;min-height:38px/);
 assert.match(css,/#quick-preset-bar\{grid-row:3/);
});


test('PWA theme-color matches actual SVG icon background in metadata, manifest, and runtime',()=>{
 const icon=read('icons/icon.svg');
 const html=read('index.html');
 const manifest=JSON.parse(read('manifest.webmanifest'));
 const themes=read('src/themes.js');
 const background=icon.match(/<rect\b[^>]*\bfill="(#[0-9A-Fa-f]{6})"/)?.[1];
 assert.equal(background,'#FBF8F4');
 assert.equal(APP_CHROME_COLOR,background);
 assert.match(html,new RegExp('meta name="theme-color" content="'+background+'"'));
 assert.equal(manifest.theme_color,background);
 assert.equal(manifest.background_color,background);
 assert.match(themes,/meta\.content=chromeColor/);
 assert.match(themes,/setFaviconBackground\(chromeColor\)/);
});

test('recipe filters match the calendar quick-preset framed-button appearance',()=>{
 const quick=css.match(/\.quick-preset\{[^}]+\}/)?.[0]||'';
 const selectedQuick=css.match(/\.quick-preset\.active,\.quick-preset\[aria-pressed="true"\]\{[^}]+\}/)?.[0]||'';
 assert.match(quick,/min-height:33px;height:33px/);
 assert.match(quick,/border-radius:8px/);
 assert.match(quick,/border:1px solid var\(--line\)/);
 assert.match(selectedQuick,/border:2px solid var\(--accent\)/);
 const rules=css.slice(css.indexOf('/* v1.12.0 —'));
 assert.match(rules,/#quick-preset-bar\.master-filter-bar \.master-filter-button\{[\s\S]*?min-height:33px/);
 assert.match(rules,/border:1px solid var\(--line\)/);
 assert.match(rules,/border-radius:8px/);
 assert.match(rules,/background:var\(--surface\)/);
 assert.match(rules,/#quick-preset-bar\.master-filter-bar \.master-filter-button\.selected,[\s\S]*?border:2px solid var\(--accent\)/);
 assert.match(rules,/box-shadow:inset 0 0 0 1px var\(--accent\)/);
 assert.match(rules,/#quick-preset-bar\.master-filter-bar \.master-filter-button:focus-visible/);
});
