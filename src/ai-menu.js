import {MAX_GENERATION_DAYS,normalize,addDays,today} from './model.js';

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
 // Enforce the recent-history exclusion before asking the AI to choose.
 // A prompt-only instruction cannot prevent recently cooked dishes on retries.
 const reference=context.referenceDate||today();
 const excludedBefore=addDays(reference,-(Number(rules.recentDays)||7));
 const excludedRecent=!!rules.excludeRecent;
 const chosen=[];
 const names=new Set();
 for(const dish of master){
  if(!Object.hasOwn(counts,dish.category))continue;
  if(excludedRecent&&dish.lastDate&&dish.lastDate>=excludedBefore)continue;
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
 // Locked dishes remain available, even if recently cooked.
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
  '日本の家庭向けに、毎回違う組み合わせの献立をJSONのみで提案してください。',
  `日数: ${days}日。days配列は必ず${days}個。各日dishes配列にはcountsの分類別品数を正確に入れてください。`,
  '形式: {"days":[{"dishes":[{"name":"料理名","category":"main","new":true}]}]}。new:trueは新規主菜だけに指定します。',
  '既存料理はcandidatesの名前・categoryをそのまま使用。lockedは同じ日に必ず含めてください。',
  'excludeRecent=trueのとき、直近recentDays日以内の料理はcandidatesから除外済みです。locked以外の除外料理を絶対に選ばないでください。',
  'unique=trueなら同じ料理名を重複させず、balance=trueなら食材や調理法を偏らせないでください。',
  '前回のpreviousSuggestedは調理履歴ではありません。固定していない料理は、候補がある限り前回と違うものを選んでください。',
  ...(rules.newMain?[
   '新しい主菜をちょうど1品だけ創作し、その料理だけnew:trueにしてください。名前は100文字以内。既存のcandidates/locked/recentNewMainsとは別の料理にしてください。',
   '新しい主菜にはprotein、method、genreを任意で付けてよい。その他の料理は新規作成しないでください。'
  ]:['新しい料理は作らず、new:trueを付けないでください。']),
  'データ:',
  JSON.stringify({days,counts,unique:!!rules.unique,excludeRecent:excludedRecent,
   recentDays:Number(rules.recentDays)||7,preferOld:!!rules.preferOld,
   balance:!!rules.balance,newMain:!!rules.newMain,
   referenceDate:reference,candidates:chosen,locked,previousSuggested,recentNewMains})
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
