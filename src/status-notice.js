/**
 * Status messages can remain plain strings, or supply detail, guidance and
 * an allowlisted set of remedy actions for the shared status dialog.
 * This state is transient: notices are not synced or persisted.
 */
export const STATUS_REMEDIES=Object.freeze({
 rules:'ルール調整',
 settings:'設定を開く',
 master:'料理マスターを開く',
 'use-rules':'ルールベースに切替'
});
const clean=value=>String(value??'').trim();
export function normalizeStatusNotice(value){
 if(typeof value==='string')return {summary:value,detail:'',guidance:'',actions:[]};
 const note=value&&typeof value==='object'?value:{};
 return {
  summary:clean(note.summary),
  detail:clean(note.detail),
  guidance:clean(note.guidance),
  actions:[...new Set(Array.isArray(note.actions)?note.actions:[])].filter(key=>Object.hasOwn(STATUS_REMEDIES,key))
 };
}

export function generationFailureNotice(error,mode='rules'){
 const detail=clean(error?.message||error)||'原因を取得できませんでした。';
 const ai=mode==='ai';
 let summary=ai?'AI献立を生成できませんでした':'献立を生成できませんでした';
 let guidance=ai?'しばらくしてから試すか、ルールベースの生成に切り替えてください。':'生成ルールや料理候補を確認してください。';
 let actions=ai?['use-rules'] : ['rules'];

 if(/主菜の品数を1以上/.test(detail)){
  summary='主菜の品数を設定してください';
  guidance='「ルール調整」で主菜を1日1品以上にしてください。AIに新しい主菜を提案させるには空き枠が必要です。';
  actions=['rules'];
 }else if(/AIが新しい主菜を.*提案できません|AIが新しい主菜を正しく提案/.test(detail)){
  summary='AIによる新しい主菜の提案に失敗しました';
  guidance='AIが新しい料理を返さなかったか、既存の料理と重複していました。もう一度AI生成を試してください。';
  actions=[];
 }else if(/品数が多すぎ|日数または品数|品数を調整|品数を設定/.test(detail)){
  summary='献立の品数を調整してください';
  guidance='「ルール調整」で1日あたりの品数を減らすか、生成日数を短くしてください。';
  actions=['rules'];
 }else if(/日数は|1〜15日|指定日数/.test(detail)&&!/AIが指定日数と異なる/.test(detail)){
  summary='生成日数を確認してください';
  guidance='献立画面で1〜15日の範囲を選び直してください。';
  actions=[];
 }else if(/固定した料理|固定を解除|固定中|固定されて/.test(detail)){
  summary='固定中の料理が生成を妨げています';
  guidance='献立画面で固定した料理を確認し、不要な固定を解除するか生成日数を戻してください。';
  actions=[];
 }else if(/無料利用枠|回数制限|quota|429|RESOURCE_EXHAUSTED/.test(detail)){
  summary='AIの無料利用枠に達した可能性があります';
  guidance='Google側の利用枠はアプリから解除できません。時間を置くか、ルールベースで生成してください。';
  actions=['use-rules'];
 }else if(/不正利用防止認証|App Check|recaptcha|403/.test(detail)){
  summary='AIの認証を確認できませんでした';
  guidance='通信環境を確認し、解消しない場合は管理者にFirebase App Checkの設定確認を依頼してください。';
  actions=['use-rules'];
 }else if(/AIはまだ利用できません|AIは未設定|AI接続/.test(detail)){
  summary='AI生成が利用できません';
  guidance='AI接続が未設定、または現在利用できない状態です。ルールベースで生成できます。';
  actions=['use-rules'];
 }else if(/重複|直近|未調理|候補が足り|登録候補|料理数|条件と一致|新しい主菜/.test(detail)){
  summary='献立の候補や生成条件を確認してください';
  guidance='「ルール調整」で重複・直近の除外・品数などを確認してください。料理の候補が不足する場合は「料理マスター」を追加できます。';
  actions=['rules','master'];
 }else if(ai&&/JSON|返答|応答|有効な献立|献立形式|指定日数と異なる|料理が含まれて|取得できません/.test(detail)){
  summary='AIの応答を献立に反映できませんでした';
  guidance='返答の形式が不正か、通信・AI処理に問題があった可能性があります。もう一度試すか、ルールベースで生成してください。';
  actions=['use-rules'];
 }
 return normalizeStatusNotice({summary,detail,guidance,actions});
}

/**
 * Rules-based generation is best-effort: it can return a partial plan and
 * validation issues without throwing. Surface these through the same status
 * workflow used for thrown AI errors.
 */
export function generationIssuesNotice(issues){
 const details=[...new Set((Array.isArray(issues)?issues:[]).map(clean).filter(Boolean))];
 if(!details.length)return null;
 const shortage=details.some(item=>/候補が\d+品不足|未調理の主菜がありません/.test(item));
 const fixed=details.some(item=>/固定|重複/.test(item));
 return normalizeStatusNotice({
  summary:shortage?'献立の料理候補が不足しています':'生成した献立に確認事項があります',
  detail:details.join('\n'),
  guidance:fixed
   ?'固定した料理や重複の条件を確認してください。ルールを見直すか、料理マスターに候補を追加できます。'
   :'ルール調整で直近の除外条件や1日あたりの品数を見直すか、料理マスターに候補を追加してください。',
  actions:['rules','master']
 });
}
