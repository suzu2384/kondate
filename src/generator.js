import {normalize,addDays,today} from './model.js';
export function validatePlan(plan,rules,master=[],reference=today()){
 const errors=[],seen=new Set(),byName=new Map(master.map(d=>[normalize(d.name),d]));
 for(const [i,day]of plan.entries())for(const dish of day.dishes){const key=normalize(dish.name);if(!key){errors.push(`${i+1}日目に空の料理名があります。`);continue;}if(rules.unique&&seen.has(key))errors.push(`${dish.name}が重複しています。`);seen.add(key);const last=byName.get(key)?.lastDate;if(rules.excludeRecent&&last&&last>=addDays(reference,-rules.recentDays))errors.push(`${dish.name}は直近${rules.recentDays}日以内の実績です。`);}
 return [...new Set(errors)];
}
export function generate(master,rules,previous=[],reference=today(),random=Math.random){
 const plan=Array.from({length:rules.days},(_,i)=>({id:previous[i]?.id||`day-${i}`,dishes:(previous[i]?.dishes||[]).filter(d=>d.locked).map(d=>({...d}))}));
 const used=new Set(plan.flatMap(d=>d.dishes.map(x=>normalize(x.name)))),issues=[];
 const counts={protein:new Map(),method:new Map(),genre:new Map()};
 function tally(d){for(const k of Object.keys(counts)){if(d[k]&&d[k]!=='不明')counts[k].set(d[k],(counts[k].get(d[k])||0)+1);}}
 plan.flatMap(d=>d.dishes).forEach(tally);
 function pick(category,mustNew=false,dayIndex=0){
  let pool=master.filter(d=>d.category===category&&(!rules.unique||!used.has(normalize(d.name)))&&(!rules.excludeRecent||!d.lastDate||d.lastDate<addDays(reference,-rules.recentDays))&&(!mustNew||!d.count));
  if(!pool.length)return null;
  const scored=pool.map(d=>{let score=random()*8;
   if(rules.preferOld)score+=!d.lastDate?45:d.lastDate<addDays(reference,-rules.oldDays)?40:Math.min(rules.oldDays,Math.max(0,(Date.parse(reference)-Date.parse(d.lastDate))/86400000))/Math.max(1,rules.oldDays)*20;
   if(rules.balance)for(const k of Object.keys(counts)){if(d[k]&&d[k]!=='不明'){score-=(counts[k].get(d[k])||0)*12;if(plan[dayIndex]?.dishes.some(x=>x[k]===d[k]))score-=6;if(dayIndex>0&&plan[dayIndex-1].dishes.some(x=>x.category===category&&x[k]===d[k]))score-=8;}}
   return {d,score};}).sort((a,b)=>b.score-a.score);
  const picked={...scored[0].d,locked:false};delete picked.dates;used.add(normalize(picked.name));tally(picked);return picked;
 }
 let needNew=rules.newMain&&!plan.some(day=>day.dishes.some(d=>d.category==='main'&&!master.find(m=>normalize(m.name)===normalize(d.name))?.count));
 if(needNew&&rules.counts.main>0){const target=plan.findIndex(day=>day.dishes.filter(d=>d.category==='main').length<rules.counts.main);if(target>=0){const d=pick('main',true,target);if(d){plan[target].dishes.push(d);needNew=false;}else issues.push('未調理の主菜がありません。料理マスターに新しい主菜を追加するか「新しい主菜を1品」を解除してください。');}else issues.push('主菜がすべて固定されているため、新しい主菜を追加できません。固定を解除してください。');}
 for(let i=0;i<plan.length;i++)for(const[category,count]of Object.entries(rules.counts)){let missing=0;for(let n=plan[i].dishes.filter(d=>d.category===category).length;n<count;n++){const d=pick(category,false,i);if(d)plan[i].dishes.push(d);else missing++;}if(missing)issues.push(`${i+1}日目：${category}の候補が${missing}品不足しています。`);}
 issues.push(...validatePlan(plan,rules,master,reference));
 return {plan,issues:[...new Set(issues)]};
}
export function reroll(master,rules,plan,dayIndex,dishIndex,reference=today(),random=Math.random){
 const current=plan[dayIndex].dishes[dishIndex];if(current.locked)return {dish:current,issues:['固定を解除すると再抽選できます。']};
 const used=new Set(plan.flatMap(day=>day.dishes.map(d=>normalize(d.name))));
 const candidates=master.filter(d=>d.category===current.category&&normalize(d.name)!==normalize(current.name)&&(!rules.unique||!used.has(normalize(d.name))));
 const result=generate(candidates,{...rules,days:1,newMain:false,counts:{[current.category]:1}},[],reference,random);
 return {dish:result.plan[0]?.dishes[0]||current,issues:result.issues};
}
