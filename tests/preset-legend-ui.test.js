import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');

test('legend button stays next to the calendar selector',()=>{
 const heading=app.match(/<div class="month-heading">(.+?)<button type="button" class="month-picker-trigger"/)?.[1];
 assert.ok(heading,'calendar heading exists');
 assert.ok(heading.includes('class="calendar-heading-actions"'));
 assert.ok(heading.indexOf('open-extra-calendars')<heading.indexOf('open-preset-legend'));
 assert.ok(app.includes("'open-preset-legend':()=>openPresetLegend()"));
});
test('legend is generated from current presets with inline icon, title and memo',()=>{
 const body=app.slice(app.indexOf('function openPresetLegend(){'),app.indexOf('function openExtraCalendarPicker(){'));
 assert.ok(body.includes('state.iconRules.map'));
 assert.ok(body.includes('iconMarkup(rule.icon,rule.color)'));
 assert.ok(body.includes('esc(title'));
 assert.ok(body.includes("memo.replace(/\\s+/g,' ')"));
 assert.ok(body.includes("modal('プリセット一覧'"));
});
test('legend is a compact, borderless, one-line, two-column list',()=>{
 const grid=css.split('.preset-legend-grid{')[1]?.split('}')[0]||'';
 assert.ok(grid.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
 const row=css.split('.preset-legend-item{')[1]?.split('}')[0]||'';
 assert.ok(row);
 assert.doesNotMatch(row,/border|background|border-radius/);
 const content=css.split('.preset-legend-text{')[1]?.split('}')[0]||'';
 assert.ok(content.includes('white-space:nowrap'));
 assert.ok(css.includes('.preset-legend-title{display:inline'));
 assert.ok(css.includes('.preset-legend-memo{display:inline'));
});
test('long items span both columns and recalculate on viewport resize',()=>{
 assert.ok(css.includes('.preset-legend-item.preset-legend-wide{grid-column:1/-1}'));
 assert.ok(app.includes('text.scrollWidth>text.clientWidth+1'));
 assert.ok(app.includes("item.classList.add('preset-legend-wide')"));
 assert.ok(app.includes("window.addEventListener('resize',layoutPresetLegend)"));
 assert.ok(app.includes('layoutPresetLegend();'));
});
