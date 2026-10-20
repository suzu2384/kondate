import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderDayDetail} from '../src/day-detail.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),cache=read('sw.js');
const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const render=(records=[],otherEvents=[])=>renderDayDetail({
 date:'2026-10-20',records,otherEvents,
 categoryName:category=>({main:'主菜',side:'副菜'})[category]||category,
 iconMarkup:icon=>'<svg data-icon="'+escapeText(icon)+'"></svg>',
 esc:escapeText,
 button:(label,action,cls,attrs)=>'<button class="'+cls+'" data-action="'+action+'" '+attrs+'>'+label+'</button>'
});
const record=(id,dishes=[{name:'カレー',category:'main'}])=>({
 id,calendarId:'cal-1',date:'2026-10-20',status:'actual',dishes
});

test('date and registration button share the heading row',()=>{
 const markup=render();
 assert.match(markup,/<div class="day-detail-heading">\s*<h2>10月20日 <small>（火）<\/small><\/h2>\s*<button[^>]*data-action="new-record"[^>]*>料理を登録<\/button>/);
 assert.doesNotMatch(markup,/この日に登録|詳細・編集|（表示のみ）|調理実績/);
});
test('one cooking record occupies one row even with several dishes and a location',()=>{
 const meal={...record('one',[{name:'カレー',category:'main'},{name:'サラダ',category:'side'}]),location:'レストラン'};
 const markup=render([meal,record('two')],[{title:'外出',memo:'朝から\\n予定',icon:'home_2_fill',color:'#fff'}]);
 assert.equal((markup.match(/class="day-detail-row day-record-row"/g)||[]).length,2);
 assert.equal((markup.match(/class="day-detail-row day-other-row"/g)||[]).length,1);
 assert.match(markup,/主菜 カレー ／ 副菜 サラダ/);
 assert.match(markup,/レストラン/);
 assert.match(markup,/data-id="one" data-calendar="cal-1"/);
 assert.equal((markup.match(/>編集<\/button>/g)||[]).length,2);
 assert.match(markup,/外出/);
 assert.match(markup,/朝から/);
 assert.match(markup,/class="day-event-memo"/);
 assert.doesNotMatch(markup,/meal-group|dish-line|一般予定|表示のみ/);
});
test('show record empty state even when other appointments exist',()=>{
 const markup=render([],[{title:'病院',memo:'予約'}]);
 assert.match(markup,/この日の記録はありません/);
 assert.match(markup,/何を作りましたか？料理名だけでも記録できます/);
 assert.match(markup,/class="day-empty-icon"/);
 assert.match(markup,/病院/);
 assert.doesNotMatch(markup,/day-detail-other-events has-actuals/);
});
test('invalid imported cooking entry remains visible without unsafe editor action',()=>{
 const markup=render([{...record('broken',[]),status:'invalid',raw:{summary:'書式不明の料理'}}]);
 assert.match(markup,/書式不明の料理/);
 assert.match(markup,/書式を確認してください/);
 assert.doesNotMatch(markup,/data-action="record"/);
});
test('day detail CSS restricts entries to one line and only divides types',()=>{
 assert.match(css,/.day-detail-row\{[^}]*white-space:nowrap/);
 assert.match(css,/.day-detail-text\{[^}]*overflow:hidden;white-space:nowrap;text-overflow:clip/);
 assert.match(css,/.day-detail-other-events.has-actuals\{border-top:1px solid var\(--line\)/);
 assert.match(css,/.day-empty-icon\{[^}]*utensils.svg/);
 assert.match(css,/.day-record-edit\{[^}]*min-height:36px/);
 assert.match(app,/import \{renderDayDetail\} from '\.\/day-detail\.js'/);
 assert.match(app,/function dayContent\(date\)\{[\s\S]*?renderDayDetail\(/);
 assert.match(cache,/'\.\/src\/day-detail.js'/);
 assert.match(cache,/'\.\/icons\/tabs\/utensils.svg'/);
});
