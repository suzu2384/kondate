import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),sw=read('sw.js');
const begin=app.indexOf('function masterRows('),end=app.indexOf('function masterFilterButtons(',begin);
assert.ok(begin>=0&&end>begin);
function row(selected){
 const button=(label,action,cls,attrs)=>`<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
 const esc=s=>String(s);
 const run=runInNewContext(app.slice(begin,end)+';masterRows',{
  button,esc,categoryName:()=> '主菜',recipeSearchUrl:()=> 'https://www.google.com/search?q=test',
  isShoppingMasterSelected:()=>selected
 });
 return run([{name:'肉じゃが',category:'main',key:'niku',lastDate:'2026-10-01',count:2}]);
}

test('shopping tab uses uploaded SVG, not preset icon asset',()=>{
 const nav='icons/tabs/shopping-cart.svg',preset='icons/presets/shopping_cart_2_fill.svg';
 assert.match(css,/\.nav-icon-shopping\{[^}]*icons\/tabs\/shopping-cart\.svg/);
 assert.doesNotMatch(css,/\.nav-icon-shopping\{[^}]*icons\/presets\/shopping_cart_2_fill\.svg/);
 for(const icon of [nav,preset]){
  assert.ok(existsSync(new URL('../'+icon,import.meta.url)));
  assert.ok(sw.includes('./'+icon));
 }
 assert.match(read(preset),/<svg /);
});

test('search and shopping add/remove actions use the exact separate uploaded SVGs',()=>{
 for(const icon of ['search','shopping-cart-plus','shopping-cart-minus']){
  const path='icons/actions/'+icon+'.svg';
  assert.ok(existsSync(new URL('../'+path,import.meta.url)));
  assert.ok(sw.includes('./'+path));
  assert.ok(css.includes(path));
  assert.match(read(path),/viewBox="0 0 24 24"/);
 }
 assert.doesNotMatch(css,/icons\/actions\/[^\s'"]*\(1\)\.svg/);
});

test('recipe action links use the icon and keep their target and accessible name',()=>{
 const html=row(false);
 assert.match(html,/class="master-recipe-search"[^>]*target="_blank" rel="noopener noreferrer"/);
 assert.match(html,/aria-label="肉じゃがのレシピを検索"/);
 assert.match(html,/master-action-icon-search" aria-hidden="true"/);
 assert.match(html,/master-action-icon-add" aria-hidden="true"/);
 assert.match(html,/aria-label="肉じゃがを買い物に追加"/);
 assert.match(html,/aria-pressed="false"/);
 assert.doesNotMatch(html,/master-action-icon-remove/);
 assert.match(html,/data-action="edit-master"/);
});

test('already-added recipes show the minus icon and keep purchase toggle active',()=>{
 const html=row(true);
 assert.match(html,/master-action-icon-remove" aria-hidden="true"/);
 assert.match(html,/aria-label="肉じゃがを買い物から外す"/);
 assert.match(html,/title="追加済（買い物から外す）"/);
 assert.match(html,/aria-pressed="true"/);
 assert.doesNotMatch(html,/master-action-icon-add/);
});

test('icon controls have usable tap targets and theme-aware SVG masks',()=>{
 assert.match(css,/\.master-actions \.master-action-icon\{[\s\S]*?background-color:currentColor/);
 assert.match(css,/\.master-actions \.master-recipe-search,[\s\S]*?\.master-actions \.master-buy\{[\s\S]*?width:36px/);
 assert.ok(read('index.html').includes('nav-icon-shopping'));
});
