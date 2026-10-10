import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const cache=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

for(const [tab,filename] of [
 ['calendar','calendar-days.svg'],
 ['generate','chef-hat.svg'],
 ['photo','utensils.svg'],
 ['settings','settings.svg']
]){
 test(`tab ${tab} loads ${filename} with themed mask and offline precache`,()=>{
  assert.ok(html.includes(`data-tab="${tab}"`));
  assert.ok(html.includes(`class="nav-icon nav-icon-${tab}"`));
  assert.ok(css.includes(`icons/tabs/${filename}`));
  assert.ok(cache.includes(`icons/tabs/${filename}`));
  const svg=readFileSync(new URL(`../icons/tabs/${filename}`,import.meta.url),'utf8');
  assert.match(svg,/^<svg /);
  assert.match(svg,/viewBox="0 0 24 24"/);
  assert.match(svg,/stroke="currentColor"/);
 });
}
test('navigation icons use theme text colors for their vector masks',()=>{
 assert.match(css,/\.tabs button \.nav-icon\{/);
 assert.match(css,/background-color:currentColor/);
 assert.match(css,/-webkit-mask-image:url/);
});
