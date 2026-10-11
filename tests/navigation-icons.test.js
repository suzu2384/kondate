import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const cache=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

for(const [tab,path] of [
 ['calendar','icons/tabs/calendar-days.svg'],
 ['generate','icons/tabs/chef-hat.svg'],
 ['master','icons/tabs/cooking-pot.svg'],
 ['shopping','icons/presets/shopping_cart_2_fill.svg'],
 ['settings','icons/tabs/settings.svg']
]){
 test(`tab ${tab} loads ${path} with themed mask and offline precache`,()=>{
  assert.ok(html.includes(`data-tab="${tab}"`));
  assert.ok(html.includes(`class="nav-icon nav-icon-${tab}"`));
  assert.ok(css.includes(path));
  assert.ok(cache.includes(path));
  const svg=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(svg,/^<svg /);
  assert.match(svg,/viewBox="0 0 24 24"/);
 });
}
test('navigation icons use theme text colors for their vector masks',()=>{
 assert.match(css,/\.tabs button \.nav-icon\{/);
 assert.match(css,/background-color:currentColor/);
 assert.match(css,/-webkit-mask-image:url/);
});
