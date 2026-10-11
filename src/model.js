export const today = () => localDate(new Date());
export function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
/** Dates for a stable 6-week (7 × 6) calendar view, including adjacent-month days. */
export function monthGridDates(year,monthIndex){
 const start=new Date(year,monthIndex,1,12);
 start.setDate(1-start.getDay());
 return Array.from({length:42},(_,index)=>{
  const date=new Date(start);
  date.setDate(start.getDate()+index);
  return localDate(date);
 });
}
export function addDays(s,n) {const d=new Date(`${s}T12:00:00`); d.setDate(d.getDate()+n); return localDate(d);}
export const normalize = s => String(s??'').normalize('NFKC').trim().replace(/[\s　]+/g,'').toLocaleLowerCase('ja');
export const uid=()=>crypto.randomUUID().replaceAll('-','');
export const defaultCategories=[{id:'main',name:'主菜'}];
// Shared maximum for both generation modes; legacy saved values are clamped.
export const MAX_GENERATION_DAYS=15;
export function normalizeGenerationDays(value){
 const days=Math.trunc(Number(value)||7);
 return Math.max(1,Math.min(MAX_GENERATION_DAYS,days));
}
export const defaultRules={days:7,preferOld:true,oldDays:30,excludeRecent:true,recentDays:7,unique:true,balance:true,newMain:true,counts:{main:1}};
export function resolveName(name,aliases={}) {let n=String(name).trim(),seen=new Set(); while(aliases[normalize(n)]&&!seen.has(normalize(n))) {seen.add(normalize(n));n=aliases[normalize(n)];}return n;}
export function validateDishes(dishes) {if(!Array.isArray(dishes)||!dishes.length)throw Error('料理を1品以上入力してください。'); if(dishes.length>30)throw Error('一度に登録できる料理は30品までです。');return dishes.map(d=>{const name=String(d.name||'').trim();if(!name||name.length>100)throw Error('料理名は1〜100文字で入力してください。');return {name,category:String(d.category||'main'),protein:String(d.protein||'不明'),method:String(d.method||'不明'),genre:String(d.genre||'不明')};});}
export function parseLegacy(event,categories=defaultCategories) {
 const title=String(event.summary||'').replace(/^(?:【|\[)?(?:献立|晩御飯|晩ご飯|夕食|夕飯|昼食|朝食)(?:】|\])?\s*[:：\s]?/,'').trim();
 const structuredLines=String(event.description||'').split('\n').filter(line=>categories.some(c=>line.startsWith(c.name+'：')||line.startsWith(c.name+':')));
 const lines=structuredLines.length?structuredLines:[title];
 return lines.flatMap(line=>{const cat=categories.find(c=>line.startsWith(c.name+'：')||line.startsWith(c.name+':'));const body=cat?line.slice(cat.name.length+1):line;return body.split(/[、,\n／/]+/).map(name=>({name:name.trim().replace(/^[・\-]\s*/,''),category:cat?.id||'main',protein:'不明',method:'不明',genre:'不明'})).filter(d=>d.name);}).slice(0,30);
}
export const legacyFingerprint=event=>JSON.stringify([event.summary||'',event.description||'',event.start||{},event.end||{}]);
export function eventRecord(event,legacy={},categories=defaultCategories,timeZone='Asia/Tokyo') {
 if(event.status==='cancelled')return null;
 let date=event.start?.date;
 if(!date&&event.start?.dateTime){try{date=new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.start.dateTime));}catch{return null;}}
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const p=event.extendedProperties?.private||{};
 // Older draft-only Calendar entries remain on Google, but are not treated as meals.
 if(p.kondate==='1'&&p.state==='plan')return null;
 if(p.kondate==='1'){
  try {const data=JSON.parse(event.description?.split('\n--- kondate:v1 ---\n')[1]||'');return {id:event.id,date,status:p.state==='actual'?'actual':'invalid',dishes:validateDishes(data.dishes),owned:true,location:String(event.location||''),etag:event.etag,raw:event};}catch{return {id:event.id,date,status:'invalid',dishes:[],owned:true,location:String(event.location||''),raw:event,etag:event.etag};}
 }
 // All events in a selected meal calendar are confirmed; no device-local acceptance state.
 const dishes=parseLegacy(event,categories);
 return {id:event.id,date,status:dishes.length?'actual':'invalid',dishes,owned:false,location:String(event.location||''),etag:event.etag,raw:event};
}
export function buildMaster(records,aliases={},metadata={},manual=[]) {
 const map=new Map();
 const add=(dish,date)=>{const name=resolveName(dish.name,aliases),key=normalize(name);if(!key)return;let item=map.get(key);if(!item){item={...dish,name,key,dates:[],count:0,lastDate:null};map.set(key,item);}if(!date)for(const k of ['protein','method','genre'])if((!item[k]||item[k]==='不明')&&dish[k])item[k]=dish[k];if(date){item.dates.push(date);item.count++;if(!item.lastDate||date>item.lastDate)item.lastDate=date;}};
 for(const record of records)if(record.status==='actual'&&!String(record.location||'').trim())for(const dish of record.dishes)add(dish,record.date);
 for(const dish of manual)add(dish,null);
 return [...map.values()].map(d=>({...d,...metadata[d.key],name:d.name,key:d.key,dates:d.dates.sort().reverse(),count:d.count,lastDate:d.lastDate})).sort((a,b)=>(b.lastDate||'').localeCompare(a.lastDate||'')||a.name.localeCompare(b.name,'ja'));
}
export function eventPayload(record) {
 const dishes=validateDishes(record.dishes); if(!/^\d{4}-\d{2}-\d{2}$/.test(record.date)||Number.isNaN(Date.parse(record.date)))throw Error('日付を入力してください。');
 const location=String(record.location||'').trim();
 return {summary:dishes.map(d=>d.name).join('、'),location,description:`献立ノートで登録した調理実績です。\n--- kondate:v1 ---\n${JSON.stringify({version:1,dishes})}`,start:{date:record.date},end:{date:addDays(record.date,1)},transparency:'transparent',extendedProperties:{private:{kondate:'1',state:'actual'}}};
}
