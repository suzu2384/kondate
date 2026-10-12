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
 assert.match(body,/esc\(memo\.replace/);
 assert.match(body,/modal\('プリセット一覧'/);
});
test('legend uses borderless one-line rows in two columns',()=>{
 assert.match(css,/\\.preset-legend-grid\\s*\\{[^}]*grid-template-columns:repeat\\(2,minmax\\(0,1fr\\)\\)/);
 const row=css.match(/\\.preset-legend-item\\s*\\{([^}]+)\\}/)?.[1];
 assert.ok(row);
 assert.doesNotMatch(row,/border|background|border-radius/);
 assert.match(css,/\\.preset-legend-text\\s*\\{[^}]*white-space:nowrap/);
 assert.match(css,/\\.preset-legend-title\\{display:inline/);
 assert.match(css,/\\.preset-legend-memo\\{display:inline/);
 assert.match(app,/memo\\.replace\\(\\/\\\\s\\+\\/g/);
});
test('items too long for a column expand to a full row after actual measurement',()=>{
 assert.match(css,/\\.preset-legend-item\\.preset-legend-wide\\{grid-column:1\\/-1\\}/);
 assert.match(app,/text\\.scrollWidth>text\\.clientWidth\\+1/);
 assert.match(app,/item\\.classList\\.add\\('preset-legend-wide'\\)/);
 assert.match(app,/layoutPresetLegend\\(\\);/);
 assert.match(app,/window\\.addEventListener\\('resize',layoutPresetLegend\\)/);
 assert.match(css,/@media\\(max-width:760px\\)/);
});
