import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {normalizeStatusNotice,STATUS_REMEDIES} from '../src/status-notice.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('status bar always exists, with an idle label when no action is needed',()=>{
 assert.match(html,/id="status-bar"/);
 assert.match(html,/id="status-idle" class="status-idle">待機中/);
 assert.match(html,/id="preset-pending"/);
 assert.match(html,/id="notice"/);
 assert.doesNotMatch(css,/#status-bar:has\(#notice\[hidden\]\):has\(#preset-pending\[hidden\]\)\{display:none\}/);
 assert.doesNotMatch(css,/grid-template-rows:[^;\n]* 0px 58px/);
});

test('idle state is informative but does not hide actionable notices and pending changes',()=>{
 const fn=app.slice(app.indexOf('function showStatus(){'),app.indexOf('const NEW_CALENDAR_VALUE'));
 assert.match(fn,/if\(!idle&&statusBar\)/);
 assert.match(fn,/document\.createElement\('span'\)/);
 assert.match(fn,/statusBar\.prepend\(idle\)/);
 assert.match(fn,/idle\.hidden=!!message\|\|presetQueue\.size>0/);
 assert.match(fn,/busy\?'同期中…':api\.connected\?'待機中':'Google未接続'/);
 assert.match(fn,/notice\.hidden=!message/);
 assert.match(fn,/pending\.hidden=presetQueue\.size===0/);
 assert.match(css,/\.status-idle\[hidden\]\{display:none\}/);
 assert.match(css,/#status-bar\.auth-required/);
});

test('status layout remains fixed and compact with or without preset toolbar',()=>{
 assert.match(css,/\.app\{grid-template-rows:54px minmax\(0,1fr\) 22px 58px;\}/);
 assert.match(css,/\.app\.has-quick-presets\{grid-template-rows:54px minmax\(0,1fr\) 40px 22px 58px\}/);
 assert.match(css,/\.app\{grid-template-rows:49px minmax\(0,1fr\) 24px calc\(54px \+ env\(safe-area-inset-bottom\)\);\}/);
 assert.match(css,/\.app\.has-quick-presets\{grid-template-rows:49px minmax\(0,1fr\) 38px 24px calc\(54px \+ env\(safe-area-inset-bottom\)\)\}/);
 assert.match(css,/#preset-pending\{display:inline-flex;[\s\S]*?height:20px;min-height:20px/);
 const result=spawnSync(process.execPath,['--check','src/app.js'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('missing idle node in an older cached HTML does not crash app startup',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=app.slice(app.indexOf('function showStatus(){'),app.indexOf('const NEW_CALENDAR_VALUE'));
 const nodes={
  '#status-bar':{prepend(node){nodes['#status-idle']=node;},classList:{toggle(){} }},
  '#preset-pending':{hidden:true,setAttribute(){}},
  '#notice':{hidden:true,setAttribute(){}}
 };
 const context={
  '$':selector=>nodes[selector]||null,
  expiredGoogleServices:()=>({calendar:false,drive:false}),
  api:{connected:true},drive:{autoEnabled:false},presetQueue:{size:0},
  document:{createElement:tag=>({tag})},currentNotice:'',busy:false,presetFlushing:false,
  driveLastSuccessAt:0,driveSyncStatus:'',drivePending:false
 };
 const show=runInNewContext(source+';showStatus',context);
 assert.doesNotThrow(()=>show());
 assert.equal(nodes['#status-idle'].textContent,'待機中');
 assert.equal(nodes['#status-idle'].hidden,false);
 context.currentNotice='保存しました';
 assert.doesNotThrow(()=>show());
 assert.equal(nodes['#notice'].textContent,'保存しました');
 assert.equal(nodes['#status-idle'].hidden,true);
});

test('generation failures publish a short summary and use one extensible detail dialog',()=>{
 assert.match(app,/function notify\(message\)\{const note=normalizeStatusNotice\(message\)/);
 assert.match(app,/if\(action==='generate'\)notify\(generationFailureNotice\(error,state\.menuGenerationMode\)\)/);
 assert.match(app,/if\(currentNotice\)showNoticeDetail\(currentNoticeData\|\|currentNotice\)/);
 assert.match(app,/function showNoticeDetail\(note\)/);
 for(const action of ['notice-rules','notice-settings','notice-master','notice-use-rules'])
  assert.ok(app.includes("'"+action+"':"),action);
 assert.match(css,/\.status-detail-guidance/);
 const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(worker,/\.\/src\/status-notice\.js/);
});

test('status details escape untrusted messages and offer only allowlisted remedy buttons',async()=>{
 const {runInNewContext}=await import('node:vm');
 const code=app.slice(app.indexOf('function showNoticeDetail('),app.indexOf('function closeModal()'));
 assert.match(code,/esc\(info\.detail\)/);
 assert.match(code,/esc\(info\.guidance\)/);
 const calls=[];
 const escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const button=(label,action)=>'<button data-action="'+action+'">'+label+'</button>';
 const show=runInNewContext(code+';showNoticeDetail',{
  normalizeStatusNotice,STATUS_REMEDIES,esc:escape,button,
  modal:(title,body,foot)=>calls.push({title,body,foot})
 });
 show({summary:'生成失敗',detail:'<script>alert(1)</script>',guidance:'ルールを確認',
  actions:['rules','settings','unsupported']});
 assert.equal(calls.length,1);
 assert.equal(calls[0].title,'ステータス');
 assert.match(calls[0].body,/&lt;script&gt;/);
 assert.doesNotMatch(calls[0].body,/<script>/);
 assert.match(calls[0].body,/対処方法/);
 assert.match(calls[0].foot,/data-action="notice-rules"/);
 assert.match(calls[0].foot,/data-action="notice-settings"/);
 assert.doesNotMatch(calls[0].foot,/unsupported/);
});

test('status dialog uses only the header close icon and optional corrective actions',async()=>{
 const {runInNewContext}=await import('node:vm');
 const code=app.slice(app.indexOf('function showNoticeDetail('),app.indexOf('function closeModal()'));
 const calls=[];
 const render=runInNewContext(code+';showNoticeDetail',{
  normalizeStatusNotice,STATUS_REMEDIES,
  esc:s=>String(s),button:(label,action)=>'['+action+':'+label+']',
  modal:(title,body,footer)=>calls.push({title,body,footer})
 });
 render({summary:'確認事項',detail:'候補不足',actions:['rules']});
 assert.match(calls[0].footer,/notice-rules/);
 assert.doesNotMatch(calls[0].footer,/close-dialog|閉じる/);
 render({summary:'通信エラー',detail:'接続できません'});
 assert.equal(calls[1].footer,'');
 assert.match(app,/function modal\(title,body,foot=''\)/);
 assert.match(app,/button\('×','close-dialog','icon-button','aria-label="閉じる"'\)/);
});

test('validation issues from editing and rerolling are also sent to status bar',()=>{
 assert.match(app,/function checkDraft\(\)\{issues=validatePlan\([\s\S]*?notify\(issues.length\?generationIssuesNotice\(issues\):/);
 assert.match(app,/reroll:b=>\{[^\n]*?notify\(issues.length\?generationIssuesNotice\(issues\):/);
});
