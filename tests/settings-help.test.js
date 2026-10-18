import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SETTINGS_HELP,getSettingsHelp} from '../src/settings-help.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),sw=read('sw.js'),readme=read('README.md');
const topics=[
 'calendar-connection','calendar-presets','menu-rules','dish-categories',
 'shopping','drive-backup','family-share','local-export','ai','theme'
];

test('setting details are available in contextual help and are not implementation jargon',()=>{
 assert.deepEqual(Object.keys(SETTINGS_HELP).sort(),topics.slice().sort());
 for(const topic of topics){
  const help=getSettingsHelp(topic);
  assert.ok(help?.title);
  assert.ok(help.paragraphs.length>0);
  assert.ok(help.paragraphs.every(p=>p.length>15&&p.length<160));
  assert.ok(app.includes("settingsHelpButton('"+topic+"'"),topic+' help entry not in UI');
 }
 assert.equal(getSettingsHelp('unknown'),null);
 assert.ok(app.includes("'settings-help':b=>showSettingsHelp(b.dataset.help)"));
 assert.ok(app.includes('class="settings-help-button" data-action="settings-help"'));
 assert.ok(app.includes("modal('ヘルプ：'+help.title"));
 assert.ok(css.includes('.settings-heading-with-help .settings-help-button'));
 assert.ok(css.includes('.settings-help-subheading'));
 assert.ok(!css.includes('.settings-help-field-heading'));
 assert.ok(!css.includes('.settings-help-check-row'));
 assert.ok(sw.includes("'./src/settings-help.js'"));
});
test('section help covers subordinate controls without individual question buttons',()=>{
 const expectedSections={
  'calendar-connection':['接続を保持','分類別カレンダー','自動更新間隔','履歴の取得開始日'],
  'menu-rules':['献立の初期候補'],
  'shopping':['買い物リストの自動更新'],
  'drive-backup':['ドライブの自動同期']
 };
 for(const [topic,headings] of Object.entries(expectedSections)){
  const help=getSettingsHelp(topic);
  assert.deepEqual(help.sections?.map(section=>section.title),headings);
  assert.ok(help.sections.every(section=>section.paragraphs.length>0));
 }
 const smallTopics=['keep-connected','category-calendars','calendar-refresh',
  'calendar-history','menu-seed','shopping-refresh','drive-auto'];
 for(const topic of smallTopics){
  assert.equal(getSettingsHelp(topic),null,topic);
  assert.ok(!app.includes("settingsHelpButton('"+topic+"'"),topic);
 }
 const screen=app.slice(app.indexOf('function settingsCategoryContent()'),app.indexOf('function settingsCategoryButtons()'));
 assert.doesNotMatch(screen,/settings-help-field|settings-help-check-row/);
 assert.match(app,/help\.sections\|\|\[\]/);
 assert.match(app,/settings-help-subheading/);
 assert.match(app,/<h2 class="settings-heading-with-help">買い物/);
 assert.doesNotMatch(app,/settings-category-heading/);
 assert.doesNotMatch(css,/\.settings-category-heading/);
 const template=app.slice(app.indexOf('function settingsScreen()'),app.indexOf('\n\nfunction modal('));
 assert.doesNotMatch(template,/<h2/,'category page must not repeat section titles');
});
test('technical explanations are no longer inline in the settings sections',()=>{
 const start=app.indexOf('function settingsCategoryContent()');
 const end=app.indexOf('function settingsCategoryButtons()',start);
 const screen=app.slice(start,end);
 assert.ok(start>=0&&end>start);
 for(const detail of ['短期アクセストークン','アプリ専用領域','バックグラウンドでは同期','取得対象は日本時間','JSON','写真解析の接続基盤'])
  assert.ok(!screen.includes(detail),'Leaked internal description: '+detail);
 assert.ok(!app.includes('既存料理の食材・調理法は「料理マスター」で補えます。属性不明'));
});
test('README is a current specification rather than version history or setup instructions',()=>{
 assert.match(readme,/^# KonDate\b/);
 for(const heading of ['アプリ構成と運用上の制約','カレンダー・実績','料理マスター','献立生成','買い物リスト','家族共有','設定・ドライブバックアップ','UI・PWA','ファイル構成','テストと検証範囲'])
  assert.ok(readme.includes('## '+heading),heading);
 assert.doesNotMatch(readme,/^#{2,4}\s*v?\d+\.\d+\.\d+[:：\s]/m);
 assert.doesNotMatch(readme,/^## (起動|GitHubとGitHub Pagesへの公開|Google Cloud設定|開発者側の初期設定)/m);
 assert.ok(readme.includes('src/settings-help.js'));
 assert.ok(readme.length<15000);
});
