import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('dark and light swatches each show seven matching colors',()=>{
 assert.match(app,/\[\['暗め',false\],\['明るめ',true\]\]/);
 assert.match(app,/\.filter\(\(\[,c\]\)=>!!c\.rich===rich\)/);
 assert.match(app,/data-action="theme" data-color="\$\{key\}"/);
 assert.match(app,/aria-label="\$\{c.name\}"/);
 assert.match(app,/--swatch:\$\{c.rich\?c.dark:c.light\}/);
 assert.match(css,/\.theme-tone-swatches\s*\{/);
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/\.theme-tone-swatches \.swatch\{/);
 assert.match(css,/@media\(max-width:760px\)/);
});

test('only accents change while normal text is described as unchanged',()=>{
 assert.match(app,/アプリの色と表示モードを選びます/);
 assert.match(app,/settingsHelpButton\('theme'/);
 assert.match(app,/normalizeThemeColor\(state\.theme\.color\)/);
});
