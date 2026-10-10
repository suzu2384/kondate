import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
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
