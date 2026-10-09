import {normalizeIcon,normalizeIconColor} from './calendar-display.js';

export function beginPresetEdit(existing,id){
 const rule=existing?{...existing}:{id,keyword:'',memo:'',calendarId:'',icon:'tag_fill',color:'#ffffff'};
 return {...rule,keyword:String(rule.keyword||''),memo:String(rule.memo||''),
  calendarId:String(rule.calendarId||''),icon:normalizeIcon(rule.icon),color:normalizeIconColor(rule.color)};
}
export function commitPresetEdit(draft){
 if(!draft)throw Error('編集するプリセットがありません。');
 const keyword=String(draft.keyword||'').trim(),memo=String(draft.memo||'');
 if(!keyword||keyword.length>80)throw Error('タイトルを1〜80文字で入力してください。');
 if(memo.length>2000)throw Error('メモは2000文字以内で入力してください。');
 return {...draft,keyword,memo,calendarId:String(draft.calendarId||''),
  icon:normalizeIcon(draft.icon),color:normalizeIconColor(draft.color)};
}
