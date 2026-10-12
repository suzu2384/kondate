import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('standard and spectrum swatches are grouped by tone',()=>{
 assert.match(app,/\[\['標準',false\],\['明るめ',true\]\]/);
 assert.match(app,/\.filter\(\(\[,c\]\)=>!!c\.rich===rich\)/);
 assert.match(app,/data-action="theme" data-color="\$\{key\}"/);
 assert.match(app,/aria-label="\$\{c.name\}"/);
 assert.match(app,/--swatch:\$\{c.rich\?c.dark:c.light\}/);
 assert.match(css,/\.theme-tone-swatches\s*\{/);
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/\.theme-tone-swatches \.swatch\{/);
 assert.match(css,/@media\(max-width:760px\)/);
});
