import {MAX_GENERATION_DAYS,normalize} from './model.js';

// Never send raw Calendar events, locations, other calendars, or OAuth credentials to AI.
export const AI_MAX_DAYS=MAX_GENERATION_DAYS;
export const AI_MODEL_CANDIDATE_LIMIT=160;

export const AI_RECENT_NEW_MAIN_LIMIT=16;

// Remember only names of recently suggested AI-original mains. These are not
// cooking history and do not enter the master or affect frequency scoring.
export function rememberNewMainSuggestions(history=[],plan=[]){
 const recent=[];
 const append=value=>{
  if(typeof value!=='string')return;
  const name=value.trim(),key=normalize(name);
  if(!key||name.length>100)return;
  const index=recent.findIndex(v=>normalize(v)===key);
  if(index>=0)recent.splice(index,1);
  recent.push(name);
 };
 for(const name of Array.isArray(history)?history:[])append(name);
 for(const day of Array.isArray(plan)?plan:[])for(const d of day?.dishes||[])
  if(d?.category==='main'&&d?.isNew===true)append(d.name);
 return recent.slice(-AI_RECENT_NEW_MAIN_LIMIT);
}
export function recentNewMainNames(context={}){
 const previous=Array.isArray(context.previous)?context.previous:[];
 return rememberNewMainSuggestions(context.recentNewMains,previous.map(day=>({
  dishes:(day?.dishes||[]).filter(d=>!d.locked&&d.isNew===true)
 })));
}


export function createMenuRequest(context){
 const {master=[],rules={},previous=[]}=context||{};
 const days=Number(rules.days);
 if(!Number.isInteger(days)||days<1||days>AI_MAX_DAYS)
  throw Error('AIで作れる献立は1〜15日分です。生成日数を調整してください。');
 const counts=Object.fromEntries(Object.entries(rules.counts||{}).filter(([,n])=>Number.isInteger(n)&&n>0));
 const required=Object.values(counts).reduce((a,b)=>a+b,0)*days;
 if(required===0||required>120)throw Error('AIの献立に指定した品数が多すぎます。日数または品数を調整してください。');
 if(rules.newMain&&!counts.main)throw Error('新しい主菜を提案するには、主菜の品数を1以上に設定してください。');
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
 if(rules.newMain&&locked.reduce((count,day)=>count+day.dishes.filter(d=>d.category==='main').length,0)>=days*counts.main)
  throw Error('主菜がすべて固定されています。AIに新しい主菜を提案させるには固定を解除してください。');
 // Locked meals must still be in the candidate list, even if they are not in the master.
 for(const day of locked)for(const d of day.dishes){
  if(names.has(normalize(d.name)))continue;
  chosen.push({name:d.name,category:d.category,count:0,lastDate:null,protein:'不明',method:'不明',genre:'不明'});
  names.add(normalize(d.name));
 }
 // A draft is a recent *proposal*, not cooking history. Use it only as a soft
 // diversification hint. Locked dishes must always be carried over unchanged.
 const recentNewMains=rules.newMain?recentNewMainNames(context):[];
 const previousSuggested=[...new Set(previous.flatMap(day=>(day?.dishes||[])
  .filter(d=>d&&!d.locked&&typeof d.name==='string')
  .map(d=>d.name.trim()).filter(Boolean)))].slice(0,120);
 const prompt=[
  '日本語の家庭料理の献立を提案してください。提供データを踏まえ、JSONのみを返してください。',
  '形式: {"days":[{"dishes":[{"name":"料理名","category":"分類ID","new":true}]}]}。new:trueはAIが新規提案する主菜だけ。他の料理ではnewを省略。',
  `最重要: 生成する日数は必ず${days}日です。JSONのdays配列には${days}個の要素を順番に入れてください。省略・追加は禁止です。各要素が1日分です。`,
  '厳守: daysの件数は指定日数、各日の分類別品数はcountsと完全一致。原則としてnameはcandidatesまたはlockedにある正確な料理名を使用。',
  '厳守: lockedの料理は同じ日の献立に必ず残す。uniqueがtrueなら全日を通して重複禁止。',
  'excludeRecentがtrueならlastDateがrecentDays日以内の料理は避ける（lockedは例外）。これは必須条件。falseなら直近の料理も候補にできる。',
  '献立の品質: lastDateが最も古い料理や調理回数count=0の料理ばかりを並べない。利用可能な候補から、調理回数countが多い定番料理、ほどよく期間が空いた料理、久しぶりの料理を混ぜる。古さだけで採用順位を決めない。',
  'preferOld=trueの場合、oldDays日以上作っていない料理も献立の一部で優先する。ただしそれだけで大半を占めないようにし、定番や中間的な頻度の料理も選ぶ。preferOld=falseなら古さを優先条件にしない。',
  'balance=trueなら主な食材・調理法・ジャンル・調理間隔を分散する。同じ料理が少数の古い履歴に集中せず、家庭の普段の献立として自然な組み合わせにする。',
  'previousSuggestedは前回の生成案であり、調理履歴ではない。再生成時は非固定料理を前回とできるだけ変える。十分な候補があるなら献立全体が同じにならないようにする。候補不足なら通常の料理のみ再利用してよい。lockedは絶対に維持する。',
  ...(rules.newMain?[
   'newMain=trueの場合、candidates・lockedにない新しい家庭料理の主菜を必ずちょうど1品提案し、その料理だけnew:trueとする。新しい主菜の名前は100文字以内で、既存候補と同名にしない。主菜以外や2品目以降に新しい料理を作らない。',
   '重要: recentNewMainsにある料理名は過去にAIが新規提案した主菜で、今回の新規料理に使うことを禁止する。前回の新規料理を流用したり、単に語尾・味付けの表現だけを変えて再提案しない。主要食材、調理法、料理構成を変えた別の新しい主菜を考案する。',
   '新しい主菜には任意でprotein（肉/魚/野菜・豆/卵/不明）、method（焼く/煮る/炒める/揚げる/蒸す/ゆでる/和える/不明）、genre（和食/洋食/中華/その他/不明）を付けてよい。'
  ]:['newMain=falseの場合は新しい料理を作らず、new:trueを付けない。']),
  'データ:',
  JSON.stringify({days,counts,unique:!!rules.unique,excludeRecent:!!rules.excludeRecent,
   recentDays:Number(rules.recentDays)||7,preferOld:!!rules.preferOld,
   balance:!!rules.balance,newMain:!!rules.newMain,
   referenceDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}),
   candidates:chosen,locked,previousSuggested,recentNewMains})
 ].join('\n');
 return {prompt,candidates:chosen};
}

export function parseMenuResponse(text,context){
 if(typeof text!=='string'||text.length>60000)throw Error('AIから有効な献立データを受け取れませんでした。');
 let output;
 try{output=JSON.parse(text);}catch{throw Error('AIの返答がJSON形式ではありません。再度お試しください。');}
 const requested=context.rules.days;
 if(!output||!Array.isArray(output.days))
  throw Error(`AIの返答にdays配列がありません（要求${requested}日）。`);
 if(output.days.length!==requested)
  throw Error(`AIが指定日数と異なる献立を返しました（要求${requested}日・返答${output.days.length}日）。`);
 const {candidates}=createMenuRequest(context);
 const byName=new Map(candidates.map(d=>[normalize(d.name),d]));
 // Validate novel main dishes against the entire master, not only the 160 sent candidates.
 const allKnown=new Set((context.master||[]).map(d=>normalize(d.name)));
 const previousNewMains=new Set(recentNewMainNames(context).map(normalize));
 const metadata={
  protein:new Set(['肉','魚','野菜・豆','卵','不明']),
  method:new Set(['焼く','煮る','炒める','揚げる','蒸す','ゆでる','和える','不明']),
  genre:new Set(['和食','洋食','中華','その他','不明'])
 };
 let proposed=0;
 const plan=output.days.map((day,i)=>{
  if(!day||!Array.isArray(day.dishes))throw Error('AIの献立形式が不正です。');
  return {
   id:context.previous?.[i]?.id||`day-${i}`,
   dishes:day.dishes.map(d=>{
    const name=typeof d?.name==='string'?d.name.trim():'';
    const key=normalize(name),matched=byName.get(key);
    if(matched){
     if(matched.category!==d.category||d.new===true)
      throw Error('AIが登録候補の料理名・分類を正しく返しませんでした。');
     return {name:matched.name,category:matched.category,protein:matched.protein,
      method:matched.method,genre:matched.genre,locked:false,isNew:false};
    }
    // Only one explicitly marked main may be invented. Other categories stay constrained.
    if(!context.rules.newMain||d?.category!=='main'||d.new!==true)
     throw Error('AIが登録候補にない料理を返しました。通常の献立生成も利用できます。');
    if(previousNewMains.has(key))
     throw Error('AIが前回までと同じ新しい主菜を提案しました。別の新規料理で再生成します。');
    if(!name||name.length>100||/[\u0000-\u001f\u007f]/.test(name)||!key||allKnown.has(key)||++proposed>1)
     throw Error('AIが新しい主菜を正しく提案できませんでした。再度お試しください。');
    const field=kind=>metadata[kind].has(d[kind])?d[kind]:'不明';
    return {name,category:'main',protein:field('protein'),method:field('method'),
     genre:field('genre'),locked:false,isNew:true};
   })
  };
 });
 if(context.rules.newMain&&proposed!==1)
  throw Error('AIが新しい主菜を提案できませんでした。再度お試しください。');
 return plan;
}
