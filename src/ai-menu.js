import {MAX_GENERATION_DAYS,normalize} from './model.js';

// Never send raw Calendar events, locations, other calendars, or OAuth credentials to AI.
export const AI_MAX_DAYS=MAX_GENERATION_DAYS;
export const AI_MODEL_CANDIDATE_LIMIT=160;

export function createMenuRequest(context){
 const {master=[],rules={},previous=[]}=context||{};
 const days=Number(rules.days);
 if(!Number.isInteger(days)||days<1||days>AI_MAX_DAYS)
  throw Error('AIで作れる献立は1〜15日分です。生成日数を調整してください。');
 const counts=Object.fromEntries(Object.entries(rules.counts||{}).filter(([,n])=>Number.isInteger(n)&&n>0));
 const required=Object.values(counts).reduce((a,b)=>a+b,0)*days;
 if(required===0||required>120)throw Error('AIの献立に指定した品数が多すぎます。日数または品数を調整してください。');
 const chosen=[];
 const names=new Set();
 for(const dish of master){
  if(!Object.hasOwn(counts,dish.category))continue;
  const key=normalize(dish.name);
  if(!key||names.has(key))continue;
  chosen.push({
   name:String(dish.name).slice(0,100),category:dish.category,
   count:Number(dish.count)||0,lastDate:dish.lastDate||null,
   protein:dish.protein||'不明',method:dish.method||'不明',genre:dish.genre||'不明'
  });
  names.add(key);
  if(chosen.length>=AI_MODEL_CANDIDATE_LIMIT)break;
 }
 const locked=Array.from({length:days},(_,i)=>({
  day:i+1,dishes:(previous[i]?.dishes||[]).filter(d=>d.locked).map(d=>({
   name:d.name,category:d.category
  }))
 })).filter(d=>d.dishes.length);
 // Locked meals must still be in the candidate list, even if they are not in the master.
 for(const day of locked)for(const d of day.dishes){
  if(names.has(normalize(d.name)))continue;
  chosen.push({name:d.name,category:d.category,count:0,lastDate:null,protein:'不明',method:'不明',genre:'不明'});
  names.add(normalize(d.name));
 }
 const prompt=[
  '日本語の家庭料理の献立を提案してください。以下のデータ以外は使用せず、JSONのみを返してください。',
  '形式: {"days":[{"dishes":[{"name":"料理名","category":"分類ID"}]}]}',
  '厳守: daysの件数はdays、各日の分類別品数はcountsと完全一致。nameはcandidatesまたはlockedにある正確な料理名を使用。',
  '厳守: lockedの料理は同じ日の献立に必ず残す。uniqueがtrueなら全日を通して重複禁止。',
  'excludeRecentがtrueならlastDateがrecentDays日以内の料理は避ける（lockedは例外）。',
  'preferOldがtrueなら長期間調理していない料理を優先。balanceがtrueなら食材と調理法の偏りを抑える。',
  'newMainがtrueならcount=0の主菜を少なくとも1つ使う。',
  'データ:',
  JSON.stringify({days,counts,unique:!!rules.unique,excludeRecent:!!rules.excludeRecent,
   recentDays:Number(rules.recentDays)||7,preferOld:!!rules.preferOld,
   balance:!!rules.balance,newMain:!!rules.newMain,
   referenceDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),
   candidates:chosen,locked})
 ].join('\n');
 return {prompt,candidates:chosen};
}

export function parseMenuResponse(text,context){
 if(typeof text!=='string'||text.length>60000)throw Error('AIから有効な献立データを受け取れませんでした。');
 let output;
 try{output=JSON.parse(text);}catch{throw Error('AIの返答がJSON形式ではありません。再度お試しください。');}
 if(!output||!Array.isArray(output.days)||output.days.length!==context.rules.days)
  throw Error('AIが指定日数と異なる献立を返しました。');
 const {candidates}=createMenuRequest(context);
 const byName=new Map(candidates.map(d=>[normalize(d.name),d]));
 return output.days.map((day,i)=>{
  if(!day||!Array.isArray(day.dishes))throw Error('AIの献立形式が不正です。');
  return {
   id:context.previous?.[i]?.id||`day-${i}`,
   dishes:day.dishes.map(d=>{
    const matched=byName.get(normalize(d?.name));
    if(!matched||matched.category!==d.category)
     throw Error('AIが登録候補にない料理を返しました。通常の献立生成も利用できます。');
    return {name:matched.name,category:matched.category,protein:matched.protein,
     method:matched.method,genre:matched.genre,locked:false};
   })
  };
 });
}
