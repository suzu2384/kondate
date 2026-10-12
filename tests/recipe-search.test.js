import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {recipeSearchUrl} from '../src/recipe-search.js';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('recipe search produces properly encoded Google queries for Japanese and punctuation',()=>{
 for(const name of ['鶏の照り焼き','牛&豚のソテー','トマト"チーズ"焼き','かぶのそぼろ煮']){
  const url=new URL(recipeSearchUrl(name));
  assert.equal(url.origin,'https://www.google.com');
  assert.equal(url.pathname,'/search');
  assert.equal(url.searchParams.get('q'),name+' レシピ');
 }
 assert.equal(new URL(recipeSearchUrl('  肉じゃが  ')).searchParams.get('q'),'肉じゃが レシピ');
 assert.throws(()=>recipeSearchUrl('  '),/料理名/);
});

function renderRows(dishes){
 const begin=app.indexOf('function masterRows('),end=app.indexOf('function masterScreen(');
 assert.ok(begin>=0&&end>begin);
 const source=app.slice(begin,end);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const button=(label,action,cls,attrs)=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
 return runInNewContext(source+';masterRows',{esc,button,categoryName:()=> '主菜',recipeSearchUrl,isShoppingMasterSelected:()=>false})(dishes);
}

test('each dish shows last cooked date below its name and direct search/edit actions',()=>{
 const html=renderRows([{name:'鶏の照り焼き',category:'main',lastDate:'2026-10-08',count:3,key:'teriyaki'}]);
 assert.match(html,/<li class="master-entry">/);
 assert.match(html,/<span class="master-dish-name">鶏の照り焼き<\/span>/);
 assert.match(html,/<small class="master-dish-meta">主菜.*最終調理日 2026\/10\/08.*3回<\/small>/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
 assert.match(html,/aria-label="鶏の照り焼きのレシピを検索" title="検索"><span class="master-action-icon master-action-icon-search" aria-hidden="true"><\/span><\/a>/);
 assert.match(html,/data-action="edit-master" data-key="teriyaki"/);
 const url=html.match(/href="([^"]+)"/)?.[1];
 assert.equal(new URL(url).searchParams.get('q'),'鶏の照り焼き レシピ');
 assert.ok(html.indexOf('master-dish-meta')<html.indexOf('master-actions'));
 assert.ok(html.indexOf('master-action-icon-search')<html.indexOf('>編集</button>'));
});

test('uncooked dishes remain searchable and recipe names are HTML-escaped',()=>{
 const html=renderRows([{name:'魚 <特製> & 醤油',category:'main',lastDate:null,count:0,key:'test'}]);
 assert.match(html,/<span class="master-dish-name">魚 &lt;特製&gt; &amp; 醤油<\/span>/);
 assert.match(html,/最終調理日 未調理/);
 assert.match(html,/0回/);
 const url=html.match(/href="([^"]+)"/)?.[1];
 assert.equal(new URL(url).searchParams.get('q'),'魚 <特製> & 醤油 レシピ');
 assert.doesNotMatch(html,/<特製>/);
 assert.match(renderRows([]),/該当する料理はありません/);
});

test('meal master search and scroll remain inside the tab at mobile widths',()=>{
 assert.match(app,/id="master-rows"/);
 assert.match(app,/class="master-list-wrap card scroll"/);
 assert.match(app,/previousMasterScroll=tab==='master'\?\$\('#main \.master-list-wrap'\)/);
 assert.match(app,/function refreshMasterRows\(\)/);
 assert.match(css,/\.master-entry\{display:flex;align-items:center/);
 assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.master-recipe-search,\.master-actions \.mini/);
});
