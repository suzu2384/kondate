import test from 'node:test';
import assert from 'node:assert/strict';
import {dishSuggestions} from '../src/dish-suggestions.js';
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
test('the selected category is preferred, without hiding other category dishes',()=>{
 const source=[{name:'きんぴら',category:'side'},{name:'ぎょうざ',category:'main'},{name:'ハンバーグ',category:'main'}];
 assert.equal(dishSuggestions(source,'','main')[0].name,'ぎょうざ');
 assert.equal(dishSuggestions(source,'','side')[0].name,'きんぴら');
 assert.equal(dishSuggestions(source,'','side',2).length,2);
});
test('exact names rank above prefix and partial matches',()=>{
 const source=[{name:'鶏の照り焼き弁当',category:'side'},{name:'照り焼き',category:'main'},{name:'鶏の照り焼き',category:'main'}];
 assert.equal(dishSuggestions(source,'照り焼き','main')[0].name,'照り焼き');
});
