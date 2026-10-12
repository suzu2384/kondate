import {MAX_GENERATION_DAYS,normalize,addDays,today} from './model.js';

// Never send raw Calendar events, locations, other calendars, or OAuth credentials to AI.
export const AI_MAX_DAYS=MAX_GENERATION_DAYS;
export const AI_MODEL_CANDIDATE_LIMIT=160;

export const AI_RECENT_NEW_MAIN_LIMIT=16;
export const AI_RECENT_SUGGESTION_LIMIT=96;

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
// Last several generated menus are suggestions, not cooking history.
// Keep these only as a rotation preference; never blacklist scarce choices.
export function rememberMenuSuggestions(history=[],plan=[]){
 const result=[];
 for(const name of [...(Array.isArray(history)?history:[]),
  ...(Array.isArray(plan)?plan:[]).flatMap(day=>(day?.dishes||[])
   .filter(d=>!d.locked&&!d.isNew&&typeof d.name==='string').map(d=>d.name))]){
  if(typeof name!=='string'||!name.trim()||name.length>100)continue;
  const key=normalize(name),at=result.findIndex(x=>normalize(x)===key);
  if(at>=0)result.splice(at,1);
  result.push(name.trim());
 }
 return result.slice(-AI_RECENT_SUGGESTION_LIMIT);
}
// Name similarity rejects superficial variations of a newly invented main,
// without treating every dish that shares an ingredient as identical.
export function similarDishNames(a,b){
 const left=normalize(a),right=normalize(b);
 if(left===right)return true;
 if(Math.min(left.length,right.length)<7)return false;
 const grams=value=>Array.from({length:value.length-1},(_,i)=>value.slice(i,i+2));
 const x=grams(left),y=grams(right),remaining=new Map();
 for(const gram of y)remaining.set(gram,(remaining.get(gram)||0)+1);
 let common=0;
 for(const gram of x)if(remaining.get(gram)>0){common++;remaining.set(gram,remaining.get(gram)-1);}
 return 2*common/(x.length+y.length)>=0.78;
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
 // Build the entire eligible catalog before selecting a limited AI prompt
 // pool. The master is newest-first, which is precisely the wrong cut order.
 const former=rememberMenuSuggestions(context.recentSuggested);
 const previousNonlocked=(Array.isArray(previous)?previous:[]).flatMap(day=>(day?.dishes||[])
  .filter(d=>!d.locked).map(d=>d.name));
 const recentlySuggested=new Set([...former,...previousNonlocked].map(normalize));
 const available=[],seen=new Set();
 for(const dish of master){
  if(!Object.hasOwn(counts,dish.category))continue;
  if(excludedRecent&&dish.lastDate&&dish.lastDate>=excludedBefore)continue;
  const key=normalize(dish.name);
  if(!key||seen.has(key))continue;
  seen.add(key);
  available.push({
   name:String(dish.name).slice(0,100),category:dish.category,
   count:Number(dish.count)||0,lastDate:dish.lastDate||null,
   protein:dish.protein||'不明',method:dish.method||'不明',genre:dish.genre||'不明'
  });
 }
 // Divide the limited candidate capacity proportionally across categories.
 // Rank all eligible recipes using the age setting, previous suggestions and
 // protein/method/genre variety rather than trusting the calendar sort order.
 const chosen=[];
 const usage={protein:new Map(),method:new Map(),genre:new Map()};
 const categoryPools=Object.fromEntries(Object.keys(counts).map(k=>[k,available.filter(d=>d.category===k)]));
 const age=d=>!d.lastDate?3650:Math.max(0,Math.round(
  (Date.parse(reference)-Date.parse(d.lastDate))/86400000));
 const score=d=>{
  const daysAgo=age(d),oldDays=Math.max(1,Number(rules.oldDays)||30);
  let value=rules.preferOld
   ?(daysAgo>=oldDays?65:0)+Math.min(daysAgo,365)/365*30:0;
  if(recentlySuggested.has(normalize(d.name)))value-=150;
  value-=Math.log1p(d.count)*2;
  if(rules.balance)for(const [field,penalty] of [['protein',19],['method',13],['genre',6]]){
   const v=d[field];if(v&&v!=='不明')value-=(usage[field].get(v)||0)*penalty;
  }
  return value;
 };
 const categoryOrder=Object.entries(counts).flatMap(([cat,n])=>Array.from({length:n},()=>cat));
 while(chosen.length<AI_MODEL_CANDIDATE_LIMIT){
  let advanced=false;
  for(const cat of categoryOrder){
   const pool=categoryPools[cat];
   if(!pool?.length)continue;
   // Stable sort for deterministic tests and consistent old-first behavior.
   let best=0;
   for(let i=1;i<pool.length;i++)if(score(pool[i])>score(pool[best]))best=i;
   const [dish]=pool.splice(best,1);
   chosen.push(dish);advanced=true;
   for(const key of Object.keys(usage)){
    const label=dish[key];
    if(label&&label!=='不明')usage[key].set(label,(usage[key].get(label)||0)+1);
   }
   if(chosen.length>=AI_MODEL_CANDIDATE_LIMIT)break;
  }
  if(!advanced)break;
 }
 const names=new Set(chosen.map(d=>normalize(d.name)));
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
  '日本の家庭向けに、調理履歴に偏らない献立を完成させてください。JSONのみ返してください。',
  `必須: days配列は必ず${days}日分、${days}個の要素。途中で終えず、各日countsの品数を埋めてください。`,
  `返答形式（全${days}日分の構造見本。料理名の例は必ず実際の候補名に置換）: ${JSON.stringify(example)}`,
  '既存料理はcandidates内のnameとcategoryだけをそのまま使用。lockedは指定した日から動かさない。',
  'excludeRecent=trueのとき直近recentDays日以内の料理は候補から除外済み。選ばない。',
  'preferOld=trueならoldDays日以上作っていない料理・未調理料理を優先。',
  '以前の提案履歴recentSuggestedと直前のpreviousSuggestedは調理実績ではない。選択肢がある限り再利用せず、前回から献立全体を大きく変える。',
  'balance=trueなら、同じ主食材・調理法・ジャンルを連続させず、7日間を通して偏らないように組み合わせる。',
  'unique=trueなら同じ料理名を繰り返さない。',
  ...(rules.newMain?[
   '主菜をちょうど1品だけ新しく創作し、その料理のみnew:true。candidates・locked・recentNewMainsと同一またはほぼ同じ料理は避ける。他の料理はすべて既存候補から選ぶ。',
   '新しい主菜のみprotein、method、genreを任意で指定できる。'
  ]:['新しい料理は作らず、new:trueは付けない。']),
  'データ:',
  JSON.stringify({days,counts,unique:!!rules.unique,excludeRecent:excludedRecent,
   recentDays:Number(rules.recentDays)||7,preferOld:!!rules.preferOld,
   oldDays:Math.max(1,Number(rules.oldDays)||30),
   balance:!!rules.balance,newMain:!!rules.newMain,
   referenceDate:reference,candidates:chosen,locked,previousSuggested,
   recentSuggested:former.slice(-AI_RECENT_SUGGESTION_LIMIT),recentNewMains})
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
    if([...previousNewMains].some(prior=>similarDishNames(key,prior)))
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
