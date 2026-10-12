import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('all 14 swatches are grouped by tone in two compact rows',()=>{
 assert.match(app,/\[\['標準',false\],\['鮮やか',true\]\]/);
 assert.match(app,/\.filter\(\(\[,c\]\)=>!!c\.rich===rich\)/);
 assert.match(app,/data-action="theme" data-color="\$\{key\}"/);
 assert.match(app,/aria-label="\$\{c.name\}"/);
 assert.match(css,/\.theme-tone-swatches\s*\{/);
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/\.theme-tone-swatches \.swatch\{/);
 assert.match(css,/@media\(max-width:760px\)/);
});
