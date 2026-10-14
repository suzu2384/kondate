import {validateIngredients,INGREDIENT_UNITS,MAX_INGREDIENTS} from './ingredients.js';
export function createIngredientRequest(name){
 const dishName=String(name??'').trim();
 if(!dishName||dishName.length>100)throw Error('料理名を1〜100文字で入力してください。');
 const prompt=[
  '家庭料理の1人前に必要な材料を推定してください。材料名・分量・単位を厳格なJSONだけで返してください。',
  '料理名: '+JSON.stringify(dishName),
  '形式: {"ingredients":[{"name":"醤油","quantity":1,"unit":"大さじ"},{"name":"玉ねぎ","quantity":0.25,"unit":"個"}]}。',
  '数量は正のJSON数値。1/2個は0.5個。適量・少々・ひとつまみの場合だけquantity:null。',
  'unitは原則として次の候補から選択: '+INGREDIENT_UNITS.join('、')+'。適切な単位がない場合は「粒」「葉」「切れ」など自然な単位を短い文字列で返してよい。',
  '材料は1人前の現実的な量にする。調味料・水・油も必要に応じて含める。最大'+MAX_INGREDIENTS+'件。',
  '使わない材料は追加しない。材料の重複は避ける。gとmlは材料の密度による換算が必要なので勝手に換算しない。',
  'レシピ全体の説明、料理手順、マークダウンは不要。推定値なので利用者が後から編集する前提。',
 ].join('\n');
 return {prompt};
}
export function parseIngredientResponse(text){
 if(typeof text!=='string'||text.length>30000)throw Error('AIの材料データを受け取れませんでした。');
 let parsed;
 try{parsed=JSON.parse(text);}catch{throw Error('AIの材料データがJSON形式ではありません。');}
 if(!parsed||!Array.isArray(parsed.ingredients)||parsed.ingredients.length===0)throw Error('AIから材料の一覧が返りませんでした。');
 return validateIngredients(parsed.ingredients);
}
