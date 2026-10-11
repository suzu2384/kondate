import {validatePlan} from './generator.js';
import {validateDishes,normalize} from './model.js';
// Providers are supplied at composition time. This module does not persist credentials.
export class AIService {
 constructor(provider=null){this.provider=provider;}
 get available(){return !!this.provider;}
 get canAnalyzePhoto(){return typeof this.provider?.analyzePhoto==='function';}
 async generate(context){if(!this.available)throw Error('AIは未設定です。ルールベース生成をご利用ください。');const plan=await this.provider.generate(context);if(!Array.isArray(plan)||plan.length!==context.rules.days)throw Error('AIの生成日数が指定と一致しません。');for(const day of plan)day.dishes=validateDishes(day.dishes);const errors=validatePlan(plan,context.rules,context.master);for(const day of plan)for(const[cat,count]of Object.entries(context.rules.counts))if(day.dishes.filter(d=>d.category===cat).length!==count)errors.push('AIの料理数が設定と一致しません。');if(context.rules.newMain){const known=new Set((context.master||[]).map(d=>normalize(d.name)));const locked=new Set((context.previous||[]).flatMap(day=>day.dishes.filter(d=>d.locked)).map(d=>normalize(d.name)));if(!plan.some(day=>day.dishes.some(d=>d.category==='main'&&!known.has(normalize(d.name))&&!locked.has(normalize(d.name)))))errors.push('AIが新しい主菜を提案できませんでした。再度お試しください。');}for(const [i,day]of (context.previous||[]).entries())for(const locked of day.dishes.filter(d=>d.locked)){const match=plan[i]?.dishes.find(d=>normalize(d.name)===normalize(locked.name)&&d.category===locked.category);if(!match)errors.push('AIが固定した料理を変更しました。');else match.locked=true;}if(errors.length)throw Error(errors.join('\n'));return plan;}
 async analyzePhoto(file){if(!this.canAnalyzePhoto)throw Error('このAI接続では写真解析を利用できません。');if(!file.type.startsWith('image/')||file.size>15*1024*1024)throw Error('15MB以下の画像を選択してください。');return validateDishes(await this.provider.analyzePhoto(file));}
}
