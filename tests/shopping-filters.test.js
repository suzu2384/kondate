import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MAX_SHOPPING_SERVINGS} from '../src/shopping.js';
import {estimateItem,shoppingBudget} from '../src/ingredient-prices.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),html=read('index.html');
const begin=app.indexOf('function shoppingRow('),end=app.indexOf('function editShoppingManual(',begin);
assert.ok(begin>=0&&end>begin);
const source=app.slice(begin,end);
const button=(label,action,cls='',attrs='')=>`<button data-action="${action}" class="${cls}" ${attrs}>${label}</button>`;
const sample={
 servings:5,
 pending:[{id:'auto:醤油|ml',name:'醤油',display:'60 ml',kind:'auto',sourceNames:['肉じゃが'],excluded:false,checked:false}],
 bought:[{id:'auto:牛肉|g',name:'牛肉',display:'300 g',kind:'auto',sourceNames:['肉じゃが'],excluded:false,checked:true}],
 excluded:[{id:'auto:玉ねぎ|個',name:'玉ねぎ',display:'2 個',kind:'auto',sourceNames:['肉じゃが'],excluded:true,checked:false}],
};
sample.items=[...sample.pending,...sample.bought,...sample.excluded];
function screen(filter,view=sample){
 const ctx={shoppingFilter:filter,shoppingMode:'list',shoppingPriceQuery:'',shoppingData:()=>view,button,esc:s=>String(s),MAX_SHOPPING_SERVINGS,drive:{connected:true},state:{shopping:{prices:{}}},estimateItem,shoppingBudget};
 const compiled=runInNewContext(source+';({shoppingScreen,shoppingFilterButtons})',ctx);
 return {screen:compiled.shoppingScreen(),filterBar:compiled.shoppingFilterButtons()};
}
test('pending, bought and excluded filter buttons show active state accessibly',()=>{
 for(const [filter,label] of [['pending','未購入'],['bought','購入済'],['excluded','除外']]){
  const {filterBar}=screen(filter);
  assert.match(filterBar,new RegExp('data-shopping-filter="'+filter+'" aria-pressed="true">'+label));
  assert.equal((filterBar.match(/data-action="filter-shopping"/g)||[]).length,3);
  assert.equal((filterBar.match(/aria-pressed="true"/g)||[]).length,1);
 }
});
test('each shopping filter renders its matching ingredients, not other statuses',()=>{
 const {screen:pending}=screen('pending');
 assert.match(pending,/>醤油<\/span>/);
 assert.doesNotMatch(pending,/>牛肉<\/span>|>玉ねぎ<\/span>/);
 assert.match(pending,/data-shopping-check="auto:醤油\|ml"/);
 const {screen:bought}=screen('bought');
 assert.match(bought,/>牛肉<\/span>/);
 assert.match(bought,/data-shopping-check="auto:牛肉\|g"[^>]*checked/);
 assert.doesNotMatch(bought,/>醤油<\/span>|>玉ねぎ<\/span>/);
 const {screen:excluded}=screen('excluded');
 assert.match(excluded,/>玉ねぎ<\/span>/);
 assert.match(excluded,/data-action="shopping-restore"/);
 assert.doesNotMatch(excluded,/>牛肉<\/span>|>醤油<\/span>/);
 assert.doesNotMatch(excluded,/data-shopping-check=/);
});
test('no counts, explanatory note, list section headings or expandable excluded section',()=>{
 for(const filter of ['pending','bought','excluded']){
  const {screen:markup}=screen(filter);
  assert.doesNotMatch(markup,/shopping-summary|shopping-note|shopping-excluded/);
  assert.doesNotMatch(markup,/<h3>|<details/);
  assert.doesNotMatch(markup,/「買う」で選択した料理の1人前の材料を人数分に合算しています/);
  assert.doesNotMatch(markup,/件 未購入|件 購入済み|件 除外/);
  assert.match(markup,/id="shopping-servings"/);
  assert.match(markup,/data-action="shopping-copy"/);
  assert.doesNotMatch(markup,/チェック解除|shopping-clear-checks/);
 }
});
test('empty filtered lists show state-specific empty message',()=>{
 const view={servings:2,pending:[],bought:[],excluded:[],items:sample.items};
 assert.match(screen('pending',view).screen,/未購入の材料はありません/);
 assert.match(screen('bought',view).screen,/購入済みの材料はありません/);
 assert.match(screen('excluded',view).screen,/除外した材料はありません/);
});
test('shopping filter uses the same fixed calendar footer as recipe filters',()=>{
 assert.match(html,/<main id="main"><\/main>\s*<div id="quick-preset-bar"/);
 assert.match(app,/const shoppingBar=tab==='shopping'/);
 assert.match(app,/const filterBar=masterBar\|\|shoppingBar/);
 assert.match(app,/app\.classList\.toggle\('has-master-filters',filterBar\)/);
 assert.match(app,/bar\.classList\.toggle\('shopping-filter-bar',shoppingBar\)/);
 assert.ok(app.includes('const markup=settingsBar?settingsCategoryButtons():masterBar?masterFilterButtons():shoppingFilterButtons()'));
 assert.ok(app.includes("bar.setAttribute('aria-label',settingsBar?'設定カテゴリ':masterBar?'料理の絞り込み':shoppingBar?'買い物の状態別表示'"));
 assert.match(css,/\.app\.has-master-filters\{grid-template-rows:54px minmax\(0,1fr\) 40px 22px 58px\}/);
 assert.match(css,/#quick-preset-bar\.master-filter-bar\{[\s\S]*?border-top:1px solid var\(--line\)/);
 assert.match(css,/#quick-preset-bar\.master-filter-bar\{height:38px;min-height:38px/);
});
test('filter action updates the selected state and resets list scroll without persisting',()=>{
 const found=app.match(/'filter-shopping':b=>\{([^}]+)\},/);
 assert.ok(found,'Expected filter-shopping action');
 const list={scrollTop:45};const ctx={shoppingFilter:'pending',renderCount:0,$:()=>list,render:()=>{ctx.renderCount++;}};
 const action=runInNewContext('(b)=>{'+found[1]+'}',ctx);
 action({dataset:{shoppingFilter:'bought'}});
 assert.equal(ctx.shoppingFilter,'bought');
 assert.equal(list.scrollTop,0);
 action({dataset:{shoppingFilter:'excluded'}});
 assert.equal(ctx.shoppingFilter,'excluded');
 action({dataset:{shoppingFilter:'unrecognized'}});
 assert.equal(ctx.shoppingFilter,'excluded');
 assert.equal(ctx.renderCount,2);
});

test('bulk check reset action is removed but per-item purchase toggles remain',()=>{
 assert.doesNotMatch(app,/shopping-clear-checks|チェック解除/);
 assert.match(app,/if\(el\.matches\('\[data-shopping-check\]'\)\)/);
 assert.match(app,/if\(el\.checked\)state\.shopping\.checked\[item\.id\]=item\.signature/);
 assert.match(app,/else delete state\.shopping\.checked\[item\.id\]/);
});

test('servings are a native 1–30 dropdown with exactly one saved value selected',()=>{
 const cases=[{servings:1},{servings:5},{servings:30}];
 for(const {servings} of cases){
  const {screen:markup}=screen('pending',{...sample,servings});
  const start=markup.indexOf('<select id="shopping-servings"');
  const end=markup.indexOf('</select>',start);
  assert.ok(start>=0&&end>start,'Shopping servings dropdown exists');
  const select=markup.slice(start,end+9);
  assert.equal((select.match(/<option value="/g)||[]).length,30);
  assert.equal((select.match(/ selected>/g)||[]).length,1);
  assert.match(select,new RegExp('<option value="'+servings+'" selected>'+servings+'</option>'));
  assert.doesNotMatch(select,/value="0"|value="31"/);
  assert.match(select,/aria-label="買い物に必要な人数"/);
  assert.doesNotMatch(markup,/<input id="shopping-servings"/);
 }
});

test('servings selection reuses the existing change handler that persists user selection',()=>{
 assert.match(app,/if\(el\.id==='shopping-servings'\)\{[\s\S]*?state\.shopping\.servings=n;persist\(\);render\(\);return;/);
 assert.match(css,/\.shopping-toolbar #shopping-servings\{width:68px/);
});
