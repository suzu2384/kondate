import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('calendar header places the preset legend adjacent to calendar visibility selection',()=>{
 const heading=app.match(/<div class="month-heading">(.+?)<button type="button" class="month-picker-trigger"/)?.[1];
 assert.ok(heading,'calendar heading exists');
 assert.match(heading,/class="calendar-heading-actions"/);
 assert.ok(heading.indexOf('open-extra-calendars')<heading.indexOf('open-preset-legend'));
 assert.match(app,/'open-preset-legend':\(\)=>openPresetLegend\(\)/);
});
test('legend uses the live icon preset collection and displays icon, title, and memo',()=>{
 const body=app.match(/function openPresetLegend\(\)\{([\s\S]*?)\n\}\nfunction openExtraCalendarPicker/)?.[1];
 assert.ok(body,'legend popup function exists');
 assert.match(body,/state\.iconRules\.map/);
 assert.match(body,/iconMarkup\(rule\.icon,rule\.color\)/);
 assert.match(body,/esc\(title/);
 assert.match(body,/esc\(memo\)/);
 assert.match(body,/modal\('プリセット一覧'/);
});
test('legend uses a two-column grid and wraps long text on mobile',()=>{
 assert.match(css,/\.preset-legend-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.preset-legend-memo\s*\{[^}]*overflow-wrap:anywhere/);
 assert.match(css,/@media\(max-width:760px\)\s*\{\s*\.month-heading \.calendar-heading-actions/);
});
