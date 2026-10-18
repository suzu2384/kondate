import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SETTINGS_HELP,getSettingsHelp} from '../src/settings-help.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/app.js'),css=read('style.css'),sw=read('sw.js'),readme=read('README.md');
const topics=[
 'calendar-connection','keep-connected','category-calendars','calendar-refresh',
 'calendar-history','calendar-presets','menu-rules','menu-seed','dish-categories',
 'shopping-refresh','drive-backup','drive-auto','family-share','local-export','ai','theme'
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
 assert.ok(css.includes('.settings-help-field>.settings-help-button'));
 assert.ok(sw.includes("'./src/settings-help.js'"));
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
