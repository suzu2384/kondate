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

test('recipe filters are below scrolling dish list, just above global status bar',()=>{
 const start=app.indexOf('function masterScreen()'),end=app.indexOf('function refreshMasterRows(',start);
 assert.ok(start>=0&&end>start);
 const layout=app.slice(start,end);
 const toolbar=layout.indexOf('class="master-toolbar"');
 const list=layout.indexOf('class="master-list-wrap card scroll"');
 const filters=layout.indexOf('class="master-filter-bar"');
 assert.ok(toolbar>=0&&toolbar<list&&list<filters);
 assert.match(layout,/aria-label="料理の絞り込み"/);
 assert.match(layout,/filterButton\('献立','plan'\)/);
 assert.match(layout,/filterButton\('すべて','all'\)/);
 assert.match(css,/\.master-screen \.master-list-wrap\{min-height:0;flex:1 1 auto\}/);
 assert.match(css,/\.master-screen \.master-filter-bar\{[\s\S]*?order:3;flex:0 0 auto/);
 const html=read('index.html');
 const main=html.indexOf('<main id="main">'),status=html.indexOf('<div id="status-bar"');
 assert.ok(main>=0&&status>main);
 assert.match(app,/previousMasterFilterScroll/);
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
 assert.match(themes,/meta\.content=APP_CHROME_COLOR/);
});

test('category selector is text-only while the selected item stays identifiable',()=>{
 const rules=css.slice(css.indexOf('/* v1.9.2 —'));
 assert.ok(rules.length>500,'Expected text-only overrides for recipe filters');
 assert.match(rules,/\.master-screen \.master-filter-button,[\s\S]*?border:0;/);
 assert.match(rules,/background:transparent;/);
 assert.match(rules,/\.master-screen \.master-filter-button\.selected,[\s\S]*?text-decoration:underline;/);
 assert.match(rules,/\.master-screen \.master-filter-button:hover,[\s\S]*?background:transparent;/);
 assert.match(rules,/\.master-screen \.master-filter-bar\{\s*border-top:0;/);
});
