import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css');

function renderShopping(mode='prices',query=''){
 const start=app.indexOf('function shoppingModeButtons()'),end=app.indexOf('function editShoppingPrice(',start);
 assert.ok(start>=0&&end>start);
 const priceItems=[
  {key:'たまねぎ',name:'玉ねぎ',unit:'個'},
  {key:'こめ',name:'米',unit:'g'},
  {key:'にんじん',name:'人参',unit:'本'}
 ];
 const ctx={
  shoppingMode:mode,shoppingPriceQuery:query,shoppingFilter:'pending',
  priceCatalog:()=>priceItems,normalize:x=>String(x),state:{shopping:{prices:{}}},
  button:(label,action,cls='',attrs='')=>'<button class="'+cls+'" data-action="'+action+'" '+attrs+'>'+label+'</button>',
  esc:s=>String(s),MAX_SHOPPING_SERVINGS:30,
  shoppingData:()=>({servings:3,items:[],pending:[],bought:[],excluded:[]}),
  shoppingRow:()=>'',shoppingBudget:()=>({total:0,unknown:0,priced:0}),
  drive:{connected:true}
 };
 const vm=runInNewContext(app.slice(start,end)+';({shoppingScreen,shoppingPriceItems})',ctx);
 return {markup:vm.shoppingScreen(),matching:vm.shoppingPriceItems().length};
}

test('price mode fits search, filtered count, and new price action in a single top toolbar',()=>{
 const {markup,matching}=renderShopping('prices','米');
 assert.equal(matching,1);
 const row=markup.match(/<div class="shopping-toolbar kondate-tab-toolbar shopping-prices-toolbar">([\s\S]*?)<\/div>\s*<div class="shopping-list shopping-price-list/);
 assert.ok(row,'The price list should begin immediately after its one toolbar row');
 assert.match(row[1],/data-action="shopping-mode"/);
 assert.match(row[1],/id="shopping-price-search"/);
 assert.match(row[1],/id="shopping-price-count">1件/);
 assert.match(row[1],/data-action="shopping-price-add"/);
 const order=['shopping-mode-toggle','shopping-price-search','shopping-price-count','shopping-price-add'];
 for(let i=1;i<order.length;i++)assert.ok(row[1].indexOf(order[i-1])<row[1].indexOf(order[i]));
 assert.doesNotMatch(markup,/class="shopping-price-search"/);
 assert.match(css,/\.shopping-screen \.shopping-toolbar\.shopping-prices-toolbar\{[\s\S]*?flex-wrap:nowrap/);
 assert.match(css,/\.shopping-screen \.shopping-toolbar\.shopping-prices-toolbar #shopping-price-search\{[\s\S]*?flex:1 1 0/);
 assert.match(css,/\.shopping-screen \.shopping-toolbar \.shopping-price-count\{/);
});

test('shopping list mode keeps the existing serving and list controls',()=>{
 const {markup}=renderShopping('list');
 assert.match(markup,/id="shopping-servings"/);
 assert.match(markup,/data-action="shopping-add"/);
 assert.match(markup,/data-action="shopping-copy"/);
 assert.match(markup,/data-kind="shopping"/);
 assert.doesNotMatch(markup,/id="shopping-price-search"/);
});

function renderBottomBar(mode){
 const start=app.indexOf('function renderPresetBar(){'),end=app.indexOf('function prepareGoogleIdentity()',start);
 const toggles=[],bar={
  hidden:true,innerHTML:'<button>古い内容</button>',attributes:{},
  classList:{toggle:(key,on)=>toggles.push([key,on])},
  setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}
 };
 const node={classList:{toggle:(key,on)=>toggles.push([key,on])}};
 const ctx={
  $:id=>id==='#quick-preset-bar'?bar:null,
  document:{querySelector:()=>node},
  tab:'shopping',shoppingMode:mode,
  state:{iconRules:[]},selectedPresetId:null,
  shoppingFilterButtons:()=>'<button data-action="filter-shopping">未購入</button>'
 };
 const vm=runInNewContext(app.slice(start,end)+';({renderPresetBar})',ctx);
 vm.renderPresetBar();
 return {bar,toggles};
}

test('price view reserves the same visible bottom button region as the shopping list',()=>{
 const prices=renderBottomBar('prices');
 assert.equal(prices.bar.hidden,false);
 assert.equal(prices.bar.innerHTML,'');
 assert.equal(prices.bar.attributes.role,'presentation');
 assert.ok(prices.toggles.some(([name,value])=>name==='has-master-filters'&&value));
 assert.ok(prices.toggles.some(([name,value])=>name==='shopping-filter-bar'&&value));
 const list=renderBottomBar('list');
 assert.equal(list.bar.hidden,false);
 assert.match(list.bar.innerHTML,/filter-shopping/);
 assert.equal(list.bar.attributes.role,'toolbar');
});

test('typing into the price search updates both rows and count without rerendering the screen',()=>{
 assert.match(app,/if\(el\.id==='shopping-price-search'\)\{shoppingPriceQuery=el\.value;const entries=shoppingPriceItems\(\);/);
 assert.match(app,/const count=\$\('#shopping-price-count'\);if\(count\)count\.textContent=entries\.length\+'件'/);
});
