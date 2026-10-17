import test from 'node:test';
import assert from 'node:assert/strict';
import {dishSuggestions,recordDishSuggestions,selectRecordDish} from '../src/dish-suggestions.js';
const options=[
 {name:'煮魚',category:'main'},{name:'サラダ',category:'side'},
 {name:'鮭の塩焼き',category:'main'},{name:'鯖の味噌煮',category:'main'},
 {name:'豆サラダ',category:'side'},{name:'肉じゃが',category:'main'}
];
test('suggestions work independently of mobile browser datalist support',()=>{
 assert.deepEqual(dishSuggestions(options,'サラダ','side').map(d=>d.name),['サラダ','豆サラダ']);
 assert.deepEqual(dishSuggestions(options,'鮭','main').map(d=>d.name),['鮭の塩焼き']);
 assert.deepEqual(dishSuggestions(options,'ない料理','main'),[]);
});
test('suggestions show only dishes from the selected category',()=>{
 const source=[{name:'きんぴら',category:'side'},{name:'ぎょうざ',category:'main'},{name:'ハンバーグ',category:'main'}];
 assert.deepEqual(dishSuggestions(source,'','main').map(d=>d.name),['ぎょうざ','ハンバーグ']);
 assert.deepEqual(dishSuggestions(source,'','side').map(d=>d.name),['きんぴら']);
 assert.deepEqual(dishSuggestions(source,'','side',2).map(d=>d.name),['きんぴら']);
 assert.deepEqual(dishSuggestions(source,'','soup'),[]);
 assert.deepEqual(dishSuggestions(source,'').map(d=>d.name),['きんぴら','ぎょうざ','ハンバーグ']);
});
test('exact names rank above prefix and partial matches',()=>{
 const source=[{name:'鶏の照り焼き弁当',category:'side'},{name:'照り焼き',category:'main'},{name:'鶏の照り焼き',category:'main'}];
 assert.equal(dishSuggestions(source,'照り焼き','main')[0].name,'照り焼き');
});

test('selecting a suggestion immediately replaces the input record and carries category',()=>{
 const editor={dishes:[{name:'サ',category:'main'},{name:'他',category:'soup'}]};
 const selected={name:'サラダ',category:'side',protein:'野菜・豆',method:'和える',genre:'洋食'};
 assert.equal(selectRecordDish(editor,0,selected),true);
 assert.deepEqual(editor.dishes[0],selected);
 assert.deepEqual(editor.dishes[1],{name:'他',category:'soup'});
 assert.equal(selectRecordDish(editor,3,selected),false);
 assert.equal(selectRecordDish(editor,0,null),false);
});

test('empty query suggests current generated menu before the master history',()=>{
 const master=[
  {name:'直近の煮魚',category:'main',protein:'魚'},
  {name:'最近の副菜',category:'side'},
  {name:'今週のカレー',category:'main',protein:'肉'},
  {name:'焼きそば',category:'main'}
 ];
 const days=[{dishes:[
  {name:'今週のカレー',category:'main'},
  {name:'初めての炒め物',category:'main',isNew:true},
  {name:'サラダ',category:'side'}
 ]}];
 const result=recordDishSuggestions(master,days,'','main',20);
 assert.deepEqual(result.map(d=>d.name),['今週のカレー','初めての炒め物','直近の煮魚','焼きそば']);
 assert.equal(result[0].protein,'肉');
 assert.equal(result.filter(d=>d.name==='今週のカレー').length,1);
 assert.equal(result.some(d=>d.category!=='main'),false);
});
test('generated dishes absent from the master can be picked',()=>{
 const days=[{dishes:[{name:'創作鶏丼',category:'main'},{name:'葉物サラダ',category:'side'}]}];
 assert.deepEqual(recordDishSuggestions([],days,'鶏','main').map(d=>d.name),['創作鶏丼']);
 const editor={dishes:[{name:'',category:'side'}]};
 assert.equal(selectRecordDish(editor,0,recordDishSuggestions([],days,'鶏','main')[0]),true);
 assert.equal(editor.dishes[0].name,'創作鶏丼');
 assert.equal(editor.dishes[0].category,'main');
});
test('current plan fills suggestions first, then master up to the configured limit',()=>{
 const master=Array.from({length:20},(_,i)=>({name:'履歴'+i,category:'main'}));
 const planned=[{dishes:Array.from({length:12},(_,i)=>({name:'献立'+i,category:'main'}))}];
 const result=recordDishSuggestions(master,planned,'','main',15);
 assert.equal(result.length,15);
 assert.deepEqual(result.slice(0,12).map(d=>d.name),Array.from({length:12},(_,i)=>'献立'+i));
 assert.deepEqual(recordDishSuggestions(master,[],'','main',2).map(d=>d.name),['履歴0','履歴1']);
});

test('record suggestions filter both the generated menu and master by category',()=>{
 const master=[{name:'煮魚',category:'main'},{name:'サラダ',category:'side'},{name:'味噌汁',category:'soup'}];
 const days=[{dishes:[{name:'献立の主菜',category:'main'},{name:'献立の副菜',category:'side'},{name:'献立の汁物',category:'soup'}]}];
 assert.deepEqual(recordDishSuggestions(master,days,'','main').map(d=>d.name),['献立の主菜','煮魚']);
 assert.deepEqual(recordDishSuggestions(master,days,'','side').map(d=>d.name),['献立の副菜','サラダ']);
 assert.deepEqual(recordDishSuggestions(master,days,'','soup').map(d=>d.name),['献立の汁物','味噌汁']);
 assert.deepEqual(recordDishSuggestions(master,days,'サラダ','main'),[]);
});
