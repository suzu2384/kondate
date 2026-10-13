import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const latest=css.slice(css.lastIndexOf('/* v1.14.29 —'));

test('three tabs reserve the same vertical room around their top controls',()=>{
 assert.ok(latest.length>750,'Expected latest toolbar styles');
 assert.match(latest,/\.generation-screen,\.master-screen,\.shopping-screen\{gap:5px\}/);
 assert.match(latest,/\.generation-screen \.generation-controls\.kondate-tab-toolbar,\s*\.master-screen \.master-toolbar\.kondate-tab-toolbar,\s*\.shopping-screen \.shopping-toolbar\.kondate-tab-toolbar\s*\{/);
 assert.match(latest,/height:calc\(var\(--kondate-top-control-height\) \+ 10px\)/);
 assert.match(latest,/flex:0 0 calc\(var\(--kondate-top-control-height\) \+ 10px\)/);
 assert.match(latest,/padding-top:5px/);
 assert.match(latest,/padding-bottom:5px/);
 for(const cls of ['generation-controls','master-toolbar','shopping-toolbar'])
  assert.ok(app.includes('class="'+cls+' kondate-tab-toolbar"'));
});

test('recipe and shopping rows use matching minimum height on both large and small screens',()=>{
 assert.match(latest,/\.master-screen \.master-entry,\s*\.shopping-screen \.shopping-item\{min-height:54px\}/);
 assert.match(latest,/@media\(max-width:760px\)\{[\s\S]*?\.master-screen \.master-entry,\s*\.shopping-screen \.shopping-item\{min-height:54px\}/);
 assert.match(latest,/\.shopping-screen \.shopping-item\{[\s\S]*?row-gap:1px/);
});

test('iPhone recipe search remains at 16px without suppressing pinch zoom',()=>{
 assert.match(latest,/@media\(max-width:760px\)\{[\s\S]*?\.master-screen \.master-toolbar #master-search\{\s*font-size:16px;/);
 assert.match(app,/id="master-search"/);
 assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
});
