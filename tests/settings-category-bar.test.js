import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),cache=read('sw.js');

test('settings categories share the calendar, recipe and shopping footer row',()=>{
 assert.ok(app.includes("const settingsBar=tab==='settings';"));
 assert.ok(app.includes("app.classList.toggle('has-master-filters',filterBar)"));
 assert.ok(app.includes("bar.classList.toggle('settings-category-bar',settingsBar)"));
 assert.ok(app.includes('settingsBar?settingsCategoryButtons():masterBar?'));
 assert.ok(app.includes('class="master-filter-button settings-category-button '));
 const screen=app.slice(app.indexOf('function settingsScreen()'),app.indexOf('\n\nfunction modal('));
 assert.ok(!screen.includes('settings-category-bar')&&!screen.includes('settings-category-button'));
 assert.ok(!screen.includes('<h2'),'remove the duplicate category-page heading');
 assert.ok(css.includes('#quick-preset-bar.settings-category-bar'));
 assert.ok(css.includes('flex:0 0 37px;width:37px;min-width:37px'));
 assert.ok(css.includes('.app.has-settings-categories #main{padding-bottom:0}'));
});

test('settings category icons match tabs and three uploaded assets',()=>{
 const mapping={calendar:'calendar-days.svg',generate:'chef-hat.svg',master:'cooking-pot.svg',shopping:'shopping-cart.svg',data:'database.svg',ai:'bot.svg',appearance:'palette.svg'};
 for(const [category,file] of Object.entries(mapping)){
  assert.ok(css.includes(".settings-category-icon-"+category+"{-webkit-mask-image:url('./icons/tabs/"+file+"')"),category);
  assert.ok(cache.includes("'./icons/tabs/"+file+"'"),file);
  assert.ok(read('icons/tabs/'+file).startsWith('<svg '),file);
 }
 assert.ok(app.includes('aria-pressed="${selected}"'));
});

test('meal plan reserves the exact shared bottom bar without any buttons',()=>{
 assert.ok(app.includes("const generateBar=tab==='generate';"));
 assert.ok(app.includes("const filterBar=masterBar||shoppingBar||settingsBar||generateBar;"));
 assert.ok(app.includes("app.classList.toggle('has-master-filters',filterBar)"));
 assert.ok(app.includes("bar.classList.toggle('master-filter-bar',filterBar)"));
 assert.ok(app.includes("if(generateBar){bar.innerHTML='';return;}"));
 assert.ok(app.includes("bar.setAttribute('role',generateBar?'presentation':'toolbar')"));
 assert.ok(app.includes("if(generateBar)bar.removeAttribute('aria-label')"));
 assert.match(css,/\.app\.has-master-filters\{grid-template-rows:54px minmax\(0,1fr\) 40px 22px 58px\}/);
 assert.match(css,/@media\(max-width:760px\)\{\s*\.app\.has-master-filters\{grid-template-rows:49px minmax\(0,1fr\) 38px 24px/);
 const readme=read('README.md');
 assert.ok(readme.includes('献立タブにも同じ高さの空の下部領域を確保する'));
});
