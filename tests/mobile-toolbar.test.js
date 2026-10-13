import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const version='1.14.26';
const rules=css.slice(css.indexOf('/* v1.14.26'));

test('three upper tab toolbars use one shared alignment class',()=>{
 assert.ok(rules.length>1000);
 for(const cls of ['generation-controls','master-toolbar','shopping-toolbar'])
  assert.match(app,new RegExp('class="'+cls+' kondate-tab-toolbar"'));
 assert.match(rules,/\.kondate-tab-toolbar\s*\{[^}]*align-items:center;[^}]*flex-wrap:nowrap;/);
 assert.match(rules,/--kondate-top-control-height:34px/);
});

test('recipe and shopping lists consume unused height',()=>{
 assert.match(rules,/\.master-screen \.master-list-wrap,\s*\.shopping-screen \.shopping-list\s*\{[^}]*flex:1 1 0;[^}]*min-height:0;/);
 assert.match(rules,/\.app\.has-compact-toolbar #main\{padding:0\}/);
});

test('recipe and shopping share buttons use the exact same sizing rule',()=>{
 assert.match(rules,/\.master-screen \.master-toolbar \.family-share-button,\s*\.shopping-screen \.shopping-toolbar \.family-share-button\s*\{/);
 assert.match(rules,/width:48px;\s*min-width:48px;\s*flex:0 0 48px;/);
});

test('mobile PWA references versioned assets and reactivates updated worker',()=>{
 assert.ok(html.includes('style.css?v='+version));
 assert.ok(html.includes('app.js?v='+version));
 assert.ok(sw.includes('kondate-shell-v'+version.replaceAll('.','-')));
 assert.ok(sw.includes('self.skipWaiting()'));
 assert.ok(sw.includes('self.clients.claim()'));
});
