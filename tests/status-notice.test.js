import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStatusNotice,generationFailureNotice,generationIssuesNotice,STATUS_REMEDIES} from '../src/status-notice.js';

test('status notice accepts legacy strings and structured descriptions safely',()=>{
 assert.deepEqual(normalizeStatusNotice('保存しました'),{
  summary:'保存しました',detail:'',guidance:'',actions:[]
 });
 const result=normalizeStatusNotice({
  summary:'失敗',detail:'詳細 <script>',guidance:'操作してください',
  actions:['rules','settings','master','use-rules','__proto__','fake','rules']
 });
 assert.equal(result.detail,'詳細 <script>');
 assert.deepEqual(result.actions,['rules','settings','master','use-rules']);
 assert.equal(STATUS_REMEDIES.rules,'ルール調整');
 assert.deepEqual(normalizeStatusNotice(null).actions,[]);
});

test('AI quota failure has a concise status and actionable alternative',()=>{
 const note=generationFailureNotice(new Error('AIの無料利用枠または回数制限に達しました。'),'ai');
 assert.match(note.summary,/無料利用枠/);
 assert.match(note.detail,/回数制限/);
 assert.match(note.guidance,/時間を置く|ルールベース/);
 assert.deepEqual(note.actions,['use-rules']);
});

test('rule mismatch and excessive AI dishes provide appropriate fixes',()=>{
 const tooMany=generationFailureNotice(new Error('AIの献立に指定した品数が多すぎます。日数または品数を調整してください。'),'ai');
 assert.match(tooMany.summary,/品数/);
 assert.deepEqual(tooMany.actions,['rules']);
 const constraints=generationFailureNotice(new Error('カレーが重複しています。'),'ai');
 assert.deepEqual(constraints.actions,['rules','master']);
 const fixed=generationFailureNotice(new Error('固定を解除するか、生成日数を戻してください。'),'rules');
 assert.match(fixed.summary,/固定/);
 assert.deepEqual(fixed.actions,[]);
});

test('auth and malformed responses do not pretend settings can change provider quotas',()=>{
 const denied=generationFailureNotice(new Error('AIの不正利用防止認証に失敗しました。'),'ai');
 assert.match(denied.guidance,/App Check/);
 assert.deepEqual(denied.actions,['use-rules']);
 const malformed=generationFailureNotice(new Error('AIの返答がJSON形式ではありません。'),'ai');
 assert.match(malformed.summary,/応答/);
 assert.deepEqual(malformed.actions,['use-rules']);
 const ordinary=generationFailureNotice(new Error('予期せぬ失敗'),'rules');
 assert.deepEqual(ordinary.actions,['rules']);
});

test('rule-based generation with partial results reports details rather than success',()=>{
 const note=generationIssuesNotice(['1日目：mainの候補が1品不足しています。','未調理の主菜がありません。']);
 assert.match(note.summary,/候補/);
 assert.match(note.detail,/1日目：mainの候補が1品不足/);
 assert.match(note.detail,/未調理の主菜/);
 assert.match(note.guidance,/ルール調整|料理マスター/);
 assert.deepEqual(note.actions,['rules','master']);
 assert.equal(generationIssuesNotice([]),null);
 const validation=generationIssuesNotice(['カレーが重複しています。']);
 assert.match(validation.summary,/確認事項/);
 assert.match(validation.detail,/カレーが重複/);
});

test('AI-created main dish errors show an appropriate retry explanation',()=>{
 const unavailable=generationFailureNotice(new Error('AIが新しい主菜を提案できませんでした。再度お試しください。'),'ai');
 assert.match(unavailable.summary,/新しい主菜/);
 assert.match(unavailable.guidance,/もう一度AI生成/);
 assert.deepEqual(unavailable.actions,[]);
 const noSlot=generationFailureNotice(new Error('新しい主菜を提案するには、主菜の品数を1以上に設定してください。'),'ai');
 assert.deepEqual(noSlot.actions,['rules']);
 assert.match(noSlot.summary,/主菜の品数/);
});
