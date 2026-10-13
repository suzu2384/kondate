import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDishRename} from '../src/recipe-rename.js';

const categories=[{id:'main',name:'主菜'},{id:'side',name:'副菜'}];
const aliases={'鯖の味噌煮':'サバの味噌煮'};
const targets=['サバの味噌煮'];
const legacy=(summary,description='')=>({id:'legacy',summary,description,start:{date:'2026-10-10'},etag:'e1'});

test('renaming a dish preserves other dishes and structured calendar fields',()=>{
 const event={id:'owned',summary:'鯖の味噌煮、味噌汁',start:{date:'2026-10-10'},location:'',etag:'e2',
  description:'献立ノートで登録した調理実績です。\n--- kondate:v1 ---\n'+JSON.stringify({version:1,dishes:[
   {name:'鯖の味噌煮',category:'main'}, {name:'味噌汁',category:'side'}]}),
  extendedProperties:{private:{kondate:'1',state:'actual'}}};
 const result=calendarDishRename(event,aliases,targets,categories);
 assert.equal(result.kind,'owned');
 assert.deepEqual(result.record.dishes.map(d=>d.name),['サバの味噌煮','味噌汁']);
 assert.equal(result.record.id,'owned');
 assert.equal(result.record.etag,'e2');
 assert.equal(result.record.date,'2026-10-10');
 assert.equal(calendarDishRename({...event,description:event.description.replaceAll('鯖の味噌煮','サバの味噌煮')},aliases,targets,categories),null);
});

test('legacy title is rewritten by exact dish name, not substrings',()=>{
 const event=legacy('夕食：鯖の味噌煮、鯖の味噌煮風ご飯');
 const result=calendarDishRename(event,aliases,targets,categories);
 assert.deepEqual(result,{kind:'legacy',patch:{summary:'夕食：サバの味噌煮、鯖の味噌煮風ご飯'}});
});

test('legacy classification description is rewritten without touching notes',()=>{
 const description='主菜：鯖の味噌煮\nメモ：鯖の味噌煮を買うこと\n副菜：味噌汁';
 const event=legacy('今日の晩御飯',description);
 const result=calendarDishRename(event,aliases,targets,categories);
 assert.deepEqual(result,{kind:'legacy',patch:{description:'主菜：サバの味噌煮\nメモ：鯖の味噌煮を買うこと\n副菜：味噌汁'}});
});

test('an event containing the destination name stays unchanged',()=>{
 assert.equal(calendarDishRename(legacy('サバの味噌煮'),aliases,targets,categories),null);
});

test('different dishes and unrelated calendar items stay unchanged',()=>{
 assert.equal(calendarDishRename(legacy('鯖の塩焼き'),aliases,targets,categories),null);
 assert.equal(calendarDishRename(legacy('会議：鯖の味噌煮について話す'),aliases,targets,categories),null);
});

test('chained aliases converge to the final dish name',()=>{
 const chain={'鯖の味噌煮':'サバの味噌煮','サバの味噌煮':'さば味噌煮'};
 const result=calendarDishRename(legacy('鯖の味噌煮'),chain,['サバの味噌煮'],categories);
 assert.deepEqual(result,{kind:'legacy',patch:{summary:'さば味噌煮'}});
});
