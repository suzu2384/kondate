import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {normalize,resolveName} from '../src/model.js';
import {hasPlannedDishes,initialMasterFilter,masterFilterItems} from '../src/master-filter.js';
import {recipeSearchUrl} from '../src/recipe-search.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const cooked=[
 {name:'肉じゃが',category:'main',key:'肉じゃが',count:6,lastDate:'2026-10-10'},
 {name:'味噌汁',category:'soup',key:'味噌汁',count:9,lastDate:'2026-10-08'},
 {name:'ハンバーグ',category:'main',key:'ハンバーグ',count:3,lastDate:'2026-10-06'},
 {name:'サラダ',category:'side',key:'サラダ',count:1,lastDate:'2026-09-20'}
];
const draft=[
 {dishes:[{name:'ハンバーグ',category:'main'},{name:'創作スープ',category:'soup'}]},
 {dishes:[{name:'肉じゃが',category:'main'},{name:'ハンバーグ',category:'main'}]}
];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(label,action,cls='',attrs='')=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const ctx={
 state:{draft,shopping:{selected:[]},categories:[{id:'main',name:'主菜'},{id:'soup',name:'汁物'},{id:'side',name:'副菜'}]},
 hasPlannedDishes,masterFilterItems,master:()=>cooked,data:()=>({aliases:{}}),normalize,resolveName,
 esc,button,categoryName:id=>({main:'主菜',soup:'汁物',side:'副菜'})[id],recipeSearchUrl,
 masterFilter:'plan',masterQuery:'',tab:'calendar',render:()=>{},
 initialMasterFilter,
};
const source=app.slice(app.indexOf('function masterItems()'),app.indexOf('let editingMaster=null'));
const functions=runInNewContext(source+';({masterItems,masterRows,masterScreen,masterFilterButtons,openMasterTab,refreshMasterRows})',ctx);

test('generated menu is shown only when named dishes have been prepared',()=>{
 assert.equal(hasPlannedDishes([]),false);
 assert.equal(hasPlannedDishes([{dishes:[]}]),false);
 assert.equal(hasPlannedDishes([{dishes:[{name:'  '}]}]),false);
 assert.equal(initialMasterFilter([]),'all');
 assert.equal(initialMasterFilter([{dishes:[{name:'麻婆豆腐'}]}]),'plan');
});

test('generated menu keeps day and dish sequence, with duplicates and newly proposed dishes',()=>{
 const items=masterFilterItems(cooked,draft,'plan');
 assert.deepEqual(Array.from(items.map(d=>d.name)),['ハンバーグ','創作スープ','肉じゃが','ハンバーグ']);
 assert.strictEqual(items[0],cooked[2]);
 assert.strictEqual(items[2],cooked[0]);
 assert.equal(items[1].unregistered,true);
 assert.equal(items[1].key,'');
 assert.equal(items[1].category,'soup');
 const markup=functions.masterRows(items);
 assert.match(markup,/創作スープのレシピを検索">検索<\/a>/);
 const lines=markup.split('class="master-entry"');
 assert.match(lines[2],/data-action="edit-master" data-key="" disabled/);
 assert.doesNotMatch(lines[1],/data-action="edit-master"[^>]*disabled/);
 assert.equal(new URL(markup.match(/href="([^"]+)"[^>]*aria-label="創作スープのレシピを検索"/)?.[1]||'https://www.google.com').searchParams.get('q'),'創作スープ レシピ');
});

test('aliases resolve to existing registered master dishes rather than disabling edit',()=>{
 const items=masterFilterItems(cooked,[{dishes:[{name:'昔の料理名',category:'main'}]}],'plan',{'昔の料理名':'肉じゃが'});
 assert.equal(items[0],cooked[0]);
 assert.equal(items[0].unregistered,undefined);
});

test('category and all filters preserve master cooking recency order',()=>{
 assert.deepEqual(Array.from(masterFilterItems(cooked,draft,'category:main').map(d=>d.name)),['肉じゃが','ハンバーグ']);
 assert.deepEqual(Array.from(masterFilterItems(cooked,draft,'category:soup').map(d=>d.name)),['味噌汁']);
 assert.strictEqual(masterFilterItems(cooked,draft,'all'),cooked);
});

test('master tab opens in generated menu, or all if nothing generated',()=>{
 ctx.masterFilter='category:main';
 ctx.masterQuery='old search';
 functions.openMasterTab();
 assert.equal(ctx.masterFilter,'plan');
 assert.equal(ctx.masterQuery,'');
 assert.equal(ctx.tab,'master');
 ctx.tab='calendar';ctx.masterFilter='plan';ctx.state.draft=[];
 functions.openMasterTab();
 assert.equal(ctx.masterFilter,'all');
});

test('master screen removes title/explanation and dynamically shows configured filters',()=>{
 ctx.state.draft=draft;ctx.masterFilter='plan';
 const html=functions.masterFilterButtons();
 assert.match(html,/data-master-filter="plan" aria-pressed="true">献立<\/button>/);
 assert.match(html,/data-master-filter="shopping" aria-pressed="false">買い物<\/button>/);
 assert.match(html,/data-master-filter="category:main" aria-pressed="false">主菜<\/button>/);
 assert.match(html,/data-master-filter="category:soup" aria-pressed="false">汁物<\/button>/);
 assert.match(html,/data-master-filter="category:side" aria-pressed="false">副菜<\/button>/);
 assert.match(html,/data-master-filter="all" aria-pressed="false">すべて<\/button>/);
 assert.doesNotMatch(functions.masterScreen(),/master-filter-bar|data-master-filter/);
 assert.match(app,/bar\.classList\.toggle\('master-filter-bar',masterBar\)/);
 assert.doesNotMatch(html,/<h2>料理マスター<\/h2>/);
 assert.doesNotMatch(html,/最終調理日の新しい順。料理の表記や属性の変更/);
 const p=html.indexOf('data-master-filter="plan"'),shopping=html.indexOf('data-master-filter="shopping"'),m=html.indexOf('data-master-filter="category:main"'),all=html.indexOf('data-master-filter="all"');
 assert.ok(p<shopping&&shopping<m&&m<all);
 ctx.state.draft=[];ctx.masterFilter='plan';
 const empty=functions.masterFilterButtons();
 assert.doesNotMatch(empty,/>献立<\/button>/);
 assert.match(empty,/data-master-filter="all" aria-pressed="true"/);
 assert.equal(ctx.masterFilter,'all');
});

test('navigation and CSS keep filter row accessible and preserve scrolling',()=>{
 assert.match(app,/if\(next==='master'&&tab!=='master'\)\{openMasterTab\(\);\}/);
 assert.match(app,/'notice-master':\(\)=>\{closeModal\(\);openMasterTab\(\);\}/);
 assert.match(app,/'filter-master':b=>/);
 assert.match(app,/previousMasterFilterScroll/);
 assert.match(css,/\.master-filter-bar\{[\s\S]*?overflow-x:auto/);
 assert.match(css,/#quick-preset-bar\.master-filter-bar \.master-filter-button\.selected/);
});

test('Buy appears for every dish, including unregistered generated-menu dishes',()=>{
 ctx.state.draft=draft;ctx.masterFilter='plan';ctx.state.shopping.selected=[];
 const markup=functions.masterRows(masterFilterItems(cooked,draft,'plan'));
 const entries=markup.split('class="master-entry"').slice(1);
 assert.equal(entries.length,4);
 assert.ok(entries.every(row=>row.includes('data-action="buy-master"')));
 assert.match(entries[1],/data-action="buy-master"[^>]*data-name="創作スープ"/);
 assert.match(entries[1],/data-action="edit-master"[^>]*disabled/);
 ctx.state.shopping.selected=['ハンバーグ'];
 assert.match(functions.masterRows([cooked[2]]),/data-action="buy-master"[^>]*aria-pressed="true"/);
});

test('shopping filter contains only explicitly chosen dishes in selection order',()=>{
 ctx.state.shopping.selected=['ハンバーグ','肉じゃが'];
 ctx.masterFilter='shopping';
 const selected=functions.masterItems();
 assert.deepEqual(Array.from(selected.map(d=>d.name)),['ハンバーグ','肉じゃが']);
 assert.strictEqual(selected[0],cooked[2]);
 assert.strictEqual(selected[1],cooked[0]);
 assert.match(functions.masterFilterButtons(),/data-master-filter="shopping" aria-pressed="true">買い物<\/button>/);
 ctx.state.draft=[];
 assert.match(functions.masterFilterButtons(),/data-master-filter="shopping" aria-pressed="true">買い物<\/button>/);
 ctx.state.shopping.selected=[];
 assert.deepEqual(Array.from(functions.masterItems()),[]);
 assert.match(functions.masterScreen(),/data-master-filter="shopping" aria-pressed="true"/);
});

test('shopping filter follows alias changes, and allows removing missing master entries',()=>{
 const selected=masterFilterItems(cooked,[], 'shopping',{'旧ハンバーグ':'ハンバーグ'}, ['旧ハンバーグ','なくなった料理']);
 assert.equal(selected[0].name,'ハンバーグ');
 assert.equal(selected[1].name,'なくなった料理');
 assert.equal(selected[1].unregistered,true);
 assert.match(functions.masterRows(selected.slice(1)),/data-action="buy-master"/);
});
