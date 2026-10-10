import {today,localDate,addDays,uid,normalize,resolveName,defaultCategories,defaultRules,eventRecord,buildMaster,validateDishes,monthGridDates} from './model.js';
import {readState,saveState,storedState,calendarKey} from './storage.js';
import {generate,reroll,validatePlan} from './generator.js';
import {CalendarClient,calendarCreatePayload} from './google.js';
import {CALENDAR_REFRESH_MINUTES,normalizeCalendarRefreshMinutes,isCalendarRefreshDue} from './calendar-auto-refresh.js';
import {GOOGLE_CLIENT_ID} from './config.js';
import {calendarForCategory,activeCalendarIds,splitRecordByCalendar,migrateCategoryCalendars} from './calendar-routing.js';
import {eventDay,matchIcon,ICON_CHOICES,normalizeIcon,normalizeIconColor,isSupportedIcon} from './calendar-display.js';
import {presetCalendarIds,isPresetEvent,presetIcon,presetColor,matchingPresetEvent,presetEventPayload} from './icon-presets.js';
import {PresetWriteQueue,PRESET_FLUSH_INTERVAL_MS} from './preset-queue.js';
import {beginPresetEdit,commitPresetEdit} from './preset-editor.js';
import {sortCalendarExtras,reorderPresetRules,movePresetRule} from './preset-order.js';
import {DriveSettingsClient} from './drive.js';
import {expiredGoogleServices,renewExpiredGoogleServices} from './google-reauth.js';
import {dateTapAction,horizontalMonthSwipe,moveMonth} from './calendar-gestures.js';
import {driveSettingsDigest,decideDriveSync} from './drive-sync.js';
import {dishSuggestions,selectRecordDish} from './dish-suggestions.js';
import {searchPlaces,filterPlaceCandidates,LOCATION_ATTRIBUTION} from './place-suggestions.js';
import {createDriveSnapshot,readDriveSnapshot,restoreDriveSnapshot} from './drive-backup.js';
import {AIService} from './ai.js';
import {catalog} from './catalog.js';
import {colors,applyTheme} from './themes.js';
const {clientId:ignoredSavedClientId,...loaded}=readState();
const state={calendarId:'',calendarName:'',timeZone:'Asia/Tokyo',from:'2000-01-01',categories:structuredClone(defaultCategories),rules:structuredClone(defaultRules),theme:{color:'green',mode:'auto'},categoryCalendars:{},extraCalendarIds:[],iconRules:[],scopes:{},draft:[],seedEnabled:true,calendarRefreshMinutes:5,...loaded};
state.rules={...defaultRules,...loaded.rules,counts:{...defaultRules.counts,...loaded.rules?.counts}};
state.categoryCalendars=migrateCategoryCalendars(state.categories,loaded.categoryCalendars,state.calendarId);
// Legacy standard-calendar setting has been migrated to Main.
state.calendarId='';state.calendarName='';
state.extraCalendarIds=Array.isArray(loaded.extraCalendarIds)?loaded.extraCalendarIds:[];
const normalizePresetRules=rules=>(Array.isArray(rules)?rules:[]).map(rule=>({...rule,icon:normalizeIcon(rule.icon),color:normalizeIconColor(rule.color)}));
state.iconRules=normalizePresetRules(loaded.iconRules);
const presetQueue=new PresetWriteQueue(globalThis.localStorage,()=>uid());
let presetFlushing=false,presetFlushPromise=null;
state.calendarRefreshMinutes=normalizeCalendarRefreshMinutes(state.calendarRefreshMinutes);
const api=new CalendarClient(),ai=new AIService(),drive=new DriveSettingsClient();
const restoredGoogleSession=api.restoreSession(GOOGLE_CLIENT_ID);
const restoredDriveSession=drive.restoreAuto(GOOGLE_CLIENT_ID);
const DRIVE_REVISION='kondate.drive-auto-revision.v1';
const DRIVE_DIRTY='kondate.drive-auto-pending.v1';
const DRIVE_DIGEST='kondate.drive-auto-digest.v1';
const DRIVE_LAST_SUCCESS='kondate.drive-last-success.v1';
const driveMeta=key=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
const setDriveMeta=(key,value)=>{try{if(value)localStorage.setItem(key,value);else localStorage.removeItem(key);}catch{}};
let driveAutoReady=false,driveAutoBusy=false,driveAutoBooting=true,driveAutoTimer=null;
let calendarAutoReady=false,lastCalendarSync=0,lastCalendarAttempt=0;
let driveCloudRevision=driveMeta(DRIVE_REVISION),drivePending=driveMeta(DRIVE_DIRTY)==='1';
let driveBaseDigest=driveMeta(DRIVE_DIGEST);
let driveLastSuccessAt=Number(driveMeta(DRIVE_LAST_SUCCESS))||0;
let driveSyncStatus='';

const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let calendarLoadError='';
let authReady=!!globalThis.google?.accounts?.oauth2;
let authLoadError='';
let currentNotice='';
function showStatus(){
 const expired=expiredGoogleServices(api,drive);
 const warning=expired.calendar,driveWarning=expired.drive;
 const message=warning&&driveWarning?'⚠ カレンダーとDriveの再認証が必要です。タップして再接続':
  warning?'⚠ カレンダーの再認証が必要です。タップして接続':
  driveWarning?'⚠ Driveの再認証が必要です。タップして接続':currentNotice;
 const pending=$('#preset-pending');
 if(pending){
  pending.hidden=presetQueue.size===0;
  pending.textContent=presetFlushing?'予定を保存中…':`未同期 ${presetQueue.size}件 · 保存`;
  pending.title=presetFlushing?'Googleカレンダーへ一括保存しています':'未同期の予定をGoogleカレンダーへ今すぐ保存';
  pending.setAttribute('aria-label',pending.title);
 }
 const notice=$('#notice');
 notice.hidden=!message;
 notice.textContent=message;
 notice.title=warning||driveWarning?'期限切れのGoogleサービスを再認証':message;
 notice.setAttribute('aria-label',warning&&driveWarning?'カレンダーとDriveを一度に再認証します。':warning?'カレンダーを再認証します。':driveWarning?'Driveを再認証します。':message);
 // An older cached index.html can briefly be paired with a newer app.js.
 // Recreate the idle element instead of crashing the entire application.
 const statusBar=$('#status-bar');
 let idle=$('#status-idle');
 if(!idle&&statusBar){
  idle=document.createElement('span');
  idle.id='status-idle';idle.className='status-idle';
  statusBar.prepend(idle);
 }
 if(idle){
  idle.hidden=!!message||presetQueue.size>0;
  idle.textContent=busy?'同期中…':api.connected?'待機中':'Google未接続';
 }
 statusBar?.classList.toggle('has-message',!!message);
 statusBar?.classList.toggle('auth-required',warning||driveWarning);
 const status=$('#drive-sync-state');
 if(status){
  const time=driveLastSuccessAt?new Date(driveLastSuccessAt).toLocaleString('ja-JP'):'なし';
  status.textContent=!drive.autoEnabled?'自動同期：オフ':
   !drive.connected?'自動同期：再認証が必要（最後の成功 '+time+'）':
   '自動同期：'+(driveSyncStatus||'待機中')+(drivePending?'／未送信の設定変更あり':'')+'（最後の成功 '+time+'）';
 }
}

const NEW_CALENDAR_VALUE='__kondate_create_calendar__';
let calendarCreationBusy=false;
let presetEditDraft=null,presetEditOriginalId=null;
let tab='calendar',selected=today(),month=new Date(`${today().slice(0,7)}-01T12:00:00`),calendars=[],busy=false,issues=[],editor=null,masterQuery='',photoURL=null,photoFile=null;
let calendarTouchStart=null,ignoreDateClickUntil=0,selectedPresetId=null;
const scopeKeyFor=id=>calendarKey(GOOGLE_CLIENT_ID,id);
const primaryCalendarId=()=>activeCalendarIds('',state.categories,state.categoryCalendars)[0]||'';
const scopeKey=()=>scopeKeyFor(primaryCalendarId());
function dataFor(id){return state.scopes[scopeKeyFor(id)]??={events:[],legacy:{},aliases:{},metadata:{},manual:[],lastSync:null};}
function data(){return dataFor(primaryCalendarId());}
const assignedIds=()=>activeCalendarIds('',state.categories,state.categoryCalendars);
const syncedCalendarIds=()=>[...new Set([...assignedIds(),...state.extraCalendarIds,...presetCalendarIds(state.iconRules)])].filter(Boolean);
const hasSyncedCalendars=()=>syncedCalendarIds().length>0;
function records(){return assignedIds().flatMap(calendarId=>{
 const bucket=dataFor(calendarId);
 const assigned=state.categories.filter(c=>calendarForCategory(c.id,'',state.categoryCalendars)===calendarId);
 return presetQueue.project(calendarId,bucket.events).filter(e=>!isPresetEvent(e,calendarId,state.iconRules)).map(e=>{
  const r=eventRecord(e,{},state.categories,state.timeZone);
  if(!r)return null;
  r.calendarId=calendarId;
  r.scope=scopeKeyFor(calendarId);
  if(!r.owned&&r.status==='actual'&&assigned.length===1)r.dishes=r.dishes.map(d=>({...d,category:assigned[0].id}));
  return r;
 }).filter(Boolean);
});}
function master(){const enabled=new Set(state.categories.map(c=>c.id));return buildMaster(records(),data().aliases,data().metadata,[...(state.seedEnabled?catalog.filter(d=>enabled.has(d.category)):[]),...data().manual.filter(d=>enabled.has(d.category))]);}
function extraEvents(){
 const assigned=new Set(assignedIds()),explicit=new Set(state.extraCalendarIds);
 return sortCalendarExtras([...new Set([...explicit,...presetCalendarIds(state.iconRules)])].flatMap(calendarId=>
  presetQueue.project(calendarId,dataFor(calendarId).events).filter(event=>assigned.has(calendarId)?
   isPresetEvent(event,calendarId,state.iconRules):
   explicit.has(calendarId)||isPresetEvent(event,calendarId,state.iconRules)
  ).map(event=>{
   const date=eventDay(event,state.timeZone);
   if(!date)return null;
   const title=event.summary||'無題の予定';
   return {calendarId,date,title,memo:String(event.description||''),icon:presetIcon(event,calendarId,state.iconRules),color:presetColor(event,calendarId,state.iconRules),pending:!!event._presetPending,presetId:event.extendedProperties?.private?.kondatePresetId||''};
  }).filter(Boolean)
 ),state.iconRules);
}

const categoryName=id=>state.categories.find(c=>c.id===id)?.name||id;
function persist(){saveState(state);if(!driveAutoBooting&&drive.autoEnabled)markDriveDirty();}
function notify(message){currentNotice=String(message||'');showStatus();}
function updateConnection(){
 if(api.reauthenticationRequired&&!api.connected&&!api.needsReauth)api.clearToken(true);
 const connected=api.connected;
 showStatus();
 const preparing=!connected&&!authReady&&!authLoadError;
 $('#connection-label').textContent=busy?'同期中…':connected?'接続済み':'未接続';
 $('#connection-action').textContent=connected?'接続設定':preparing?'準備中':authLoadError?'再試行':'ログイン';
 $('#connection').title=connected?'Google接続設定を開く':preparing?'Googleログインを準備しています':authLoadError?'Google認証の読み込みを再試行':'Googleにログインする';
 $('#connection').setAttribute('aria-label',$('#connection').title);
 $('#connection').disabled=busy||preparing;
 $('#connection').classList.toggle('online',connected);
 $('#sync').disabled=busy||!connected||!hasSyncedCalendars();
}
let renderedViewTab='',renderedCalendarMonth='';
function render(){
 // Keep the existing day buttons alive on taps and background saves.
 // Rebuilding #main on every edit briefly clears all SVG masks and focus state.
 const previousScroll=tab==='settings'?$('#main .settings-grid')?.scrollTop:null;
 applyTheme(state.theme);
 updateConnection();
 document.querySelectorAll('[data-tab]').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const monthKey=`${month.getFullYear()}-${month.getMonth()}`;
 if(tab==='calendar'&&renderedViewTab==='calendar'&&renderedCalendarMonth===monthKey&&$('#main .month-grid')){
  patchCalendarCells();
 }else{
  $('#main').innerHTML=({calendar:calendarScreen,generate:generateScreen,photo:photoScreen,settings:settingsScreen}[tab])();
  renderedViewTab=tab;
  renderedCalendarMonth=tab==='calendar'?monthKey:'';
 }
 renderPresetBar();
 showStatus();
 if(previousScroll!=null){const list=$('#main .settings-grid');if(list)list.scrollTop=previousScroll;}
}
function iconMarkup(name,color='',extraClass=''){
 const icon=normalizeIcon(name),tint=normalizeIconColor(color);
 return `<span class="preset-svg-icon ${extraClass} ${tint.toLowerCase()==='#ffffff'?'is-white':''}" aria-hidden="true" style="--preset-svg:url('./icons/presets/${icon}.svg');color:${tint}"></span>`;
}
function renderPresetBar(){
 const bar=$('#quick-preset-bar');
 const rules=state.iconRules.filter(rule=>String(rule.keyword||'').trim()&&String(rule.calendarId||'').trim());
 const shown=tab==='calendar'&&rules.length>0;
 if(!rules.some(rule=>rule.id===selectedPresetId))selectedPresetId=null;
 document.querySelector('.app').classList.toggle('has-quick-presets',shown);
 bar.hidden=!shown;
 if(!shown){bar.innerHTML='';return;}
 const nextMarkup=rules.map(rule=>{
  const title=String(rule.keyword||'').trim(),memo=String(rule.memo||'').trim();
  const label=[title,memo,rule.calendarId?'':'（登録先未設定）'].filter(Boolean).join('／');
  const pressed=selectedPresetId===rule.id;
  return `<button type="button" data-action="select-preset" data-rule-id="${esc(rule.id)}" aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${pressed}" class="quick-preset ${pressed?'active':''}">${iconMarkup(rule.icon,rule.color)}</button>`;
 }).join('');
 if(bar.innerHTML!==nextMarkup)bar.innerHTML=nextMarkup;
}
function prepareGoogleIdentity(){
 if(!GOOGLE_CLIENT_ID)return;
 if(authReady)return;
 authLoadError='';updateConnection();
 api.loadIdentity().then(()=>{
  authReady=true;authLoadError='';
  if(tab==='settings')render();else updateConnection();
 }).catch(error=>{
  authLoadError=error.message;updateConnection();notify(error.message);
 });
}
function empty(title,text,action=''){return `<div class="empty"><div class="empty-symbol">⌑</div><strong>${title}</strong><p>${text}</p>${action}</div>`;}
function button(text,action,cls='',attrs=''){return `<button class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;}
function heading(label,title,sub,actions=''){return `<div class="page-heading"><div><div class="eyebrow">${label}</div><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>${actions}</div>`;}
function calendarCellInfo(date,list,extras){
 const d=new Date(`${date}T12:00:00`);
 const events=list.filter(e=>e.date===date),extra=extras.filter(e=>e.date===date);
 const chips=[...events.map(e=>`<span class="event-chip ${e.status}">${esc(e.owned?e.dishes.map(d=>d.name).join('、'):(e.raw?.summary||e.dishes[0]?.name||'読み込み不可'))}</span>`),
  ...extra.map(e=>`<span class="event-chip general-event ${e.icon?'has-icon':''} ${e.pending?'is-pending':''}" title="${esc(e.title+(e.memo?'／'+e.memo:''))}" aria-label="${esc(e.title+(e.memo?'／'+e.memo:''))}">${e.icon?`<span class="calendar-event-icon">${iconMarkup(e.icon,e.color)}</span><span class="calendar-event-note">${esc(e.memo.replace(/\r?\n/g,' '))}</span>`:`<span class="calendar-event-note">${esc(e.title)}</span>`}</span>`)];
 return {html:`<span class="day-number">${d.getDate()}</span>${chips.join('')}`,count:events.length+extra.length};
}
function openMonthPicker(){
 const year=month.getFullYear(),chosen=month.getMonth()+1;
 const months=Array.from({length:12},(_,i)=>i+1).map(n=>`<button type="button" class="month-picker-option ${n===chosen?'selected':''}" data-action="choose-month" data-month="${n}" aria-label="${n}月" aria-pressed="${n===chosen}">${n}月</button>`).join('');
 modal('表示する年月を選択',
  `<div class="month-picker-year"><button type="button" data-action="month-year-previous" aria-label="前年">‹</button>
   <label for="month-picker-year">年 <input id="month-picker-year" type="number" min="1900" max="2100" step="1" value="${year}"></label>
   <button type="button" data-action="month-year-next" aria-label="翌年">›</button></div>
   <div class="month-picker-options" role="group" aria-label="月を選択">${months}</div>
   <p class="hint">年を入力し、移動したい月を選んでください。</p>`,
  button('キャンセル','close-dialog'));
}
function chooseMonthFromPicker(monthNumber){
 const year=Number($('#month-picker-year')?.value);
 if(!Number.isInteger(year)||year<1900||year>2100)throw Error('年は1900〜2100の間で入力してください。');
 if(!Number.isInteger(monthNumber)||monthNumber<1||monthNumber>12)throw Error('月を選択してください。');
 month=new Date(year,monthNumber-1,1,12);
 selected=`${year}-${String(monthNumber).padStart(2,'0')}-01`;
 closeModal();render();
}
function calendarScreen(){
 const list=records(),extras=extraEvents();
 const cells=monthGridDates(month.getFullYear(),month.getMonth()).map(date=>{
  const d=new Date(`${date}T12:00:00`),cell=calendarCellInfo(date,list,extras);
  return `<button class="day ${d.getMonth()!==month.getMonth()?'other':''} ${date===selected?'selected':''} ${date===today()?'today':''}" data-action="date" data-date="${date}" aria-pressed="${date===selected}" aria-label="${date}、${cell.count}件">${cell.html}</button>`;
 }).join('');
 return `<section class="screen calendar-screen"><div class="calendar-layout"><div class="calendar-card card"><div class="month-heading"><button type="button" class="month-picker-trigger" data-action="open-month-picker" aria-label="表示年月を選択">${month.getFullYear()}年 <span>${month.getMonth()+1}月</span><span class="month-picker-chevron" aria-hidden="true">▾</span></button><div class="toolbar">${button('‹','prev-month','icon-button','aria-label="前月"')}${button('今日','today','mini')}${button('›','next-month','icon-button','aria-label="翌月"')}</div></div><div class="weekdays">${'日月火水木金土'.split('').map(d=>`<span>${d}</span>`).join('')}</div><div class="month-grid">${cells}</div></div><aside class="card day-panel">${dayContent(selected)}</aside></div></section>`;
}
function patchCalendarCells(){
 const list=records(),extras=extraEvents();
 // The 42 buttons and unchanged chips retain their actual DOM nodes.
 for(const day of document.querySelectorAll('#main .month-grid .day[data-date]')){
  const date=day.dataset.date,cell=calendarCellInfo(date,list,extras);
  if(day.innerHTML!==cell.html){
   const template=document.createElement('template');
   template.innerHTML=cell.html;
   const desired=Array.from(template.content.children),previous=Array.from(day.children);
   for(let i=0;i<Math.max(previous.length,desired.length);i++){
    if(!desired[i])previous[i].remove();
    else if(!previous[i])day.appendChild(desired[i]);
    else if(previous[i].outerHTML!==desired[i].outerHTML)previous[i].replaceWith(desired[i]);
   }
  }
  day.classList.toggle('selected',date===selected);
  day.setAttribute('aria-pressed',String(date===selected));
  day.setAttribute('aria-label',`${date}、${cell.count}件`);
 }
 const panel=$('#main .day-panel');
 if(panel){
  const markup=dayContent(selected);
  if(panel.innerHTML!==markup)panel.innerHTML=markup;
 }
}
function dayContent(date){const d=new Date(`${date}T12:00:00`);const list=records().filter(r=>r.date===date),extra=extraEvents().filter(e=>e.date===date);return `<h2>${d.getMonth()+1}月${d.getDate()}日 <small>（${'日月火水木金土'[d.getDay()]}）</small></h2><div class="date-label">${list.length+extra.length}件の記録・予定</div>${list.map(r=>`<div class="meal-group"><span class="tag ${r.status==='invalid'?'neutral':''}">${({actual:'調理実績',invalid:'書式を確認してください'})[r.status]}</span>${String(r.location||'').trim()?`<div class="date-label">外食・場所：${esc(r.location)}</div>`:''}${r.dishes.map(d=>`<div class="dish-line"><span class="category">${esc(categoryName(d.category))}</span><span>${esc(d.name)}</span></div>`).join('')}${r.status==='invalid'?`<p class="hint">元の予定をカレンダーで確認してください。変更せず保護しています。</p>`:button('詳細・編集','record','text-button mini',`data-id="${esc(r.id)}" data-calendar="${esc(r.calendarId)}"`)}</div>`).join('')||(!extra.length?empty('この日の記録はありません','何を作りましたか？料理名だけでも記録できます。'):'')}${extra.map(e=>`<div class="meal-group general-event-detail">${e.icon?`<span class="general-event-detail-icon">${iconMarkup(e.icon,e.color)}</span>`:''}<span><strong>${esc(e.title)}</strong>${e.memo?`<span class="general-event-memo">${esc(e.memo)}</span>`:''}</span> <small>（表示のみ）</small></div>`).join('')}${button('＋ この日に登録','new-record','full',`data-date="${date}"`)}`;}
function generateScreen(){
 return `<section class="screen generation-screen">
 <div class="generation-controls">
  <label><input aria-label="生成日数" type="number" id="days" min="1" max="31" value="${state.rules.days}">日分</label>
  <select aria-label="選定モード" id="generate-mode"><option value="rules">ルールベース</option value="ai" ${ai.available?'':'disabled'}>AI${ai.available?'':'（未設定）'}</option></select>
  ${button('生成','generate','primary mini')}
  ${button('ルール調整','rules','text-button mini')}${button('料理マスター','master','text-button mini')}
 </div>
 ${issues.length?`<div class="issues"><strong>条件に合う候補が足りない場合があります</strong><ul>${issues.map(s=>`<li>${esc(s.replace(/：([a-z0-9-]+)の/g,(_,c)=>'：'+categoryName(c)+'の'))}</li>`).join('')}</ul><p>料理を追加するか、直近の除外日数・1日あたりの品数を減らして再生成できます。重複許可は設定から明示的に変更してください。</p>${button('条件を変更','rules','mini')} ${button('料理を追加','add-master','mini')}</div>`:''}
 <div class="plan-grid compact-plan-grid scroll">
 ${state.draft.length?state.draft.map((day,i)=>`<article class="plan-card compact-plan-card card" aria-label="${i+1}日目の献立" data-dish-count="${day.dishes.length}">
  <div class="plan-head compact-plan-head"><h2>${i+1}日目</h2></div>
  <div class="plan-dishes">
   ${day.dishes.map((d,j)=>`<div class="plan-dish compact-plan-dish">
    <span class="plan-category" title="${esc(categoryName(d.category))}">${esc(categoryName(d.category))}</span>
    <button class="dish-name" data-action="edit-plan-dish" data-day="${i}" data-dish="${j}" title="${esc(d.name)}" aria-label="${i+1}日目の${esc(categoryName(d.category))}、${esc(d.name)}を編集">${esc(d.name)}</button>
    ${button('↻','reroll','reroll-button',`data-day="${i}" data-dish="${j}" aria-label="${i+1}日目の${esc(d.name)}を再抽選"`)}
   </div>`).join('')||'<p class="hint plan-empty">候補がありません</p>'}
  </div>
 </article>`).join(''):empty('献立の余白を、楽しもう。','履歴を参考に、設定した分類の料理を組み合わせます。生成しただけではカレンダーに登録されません。',button('7日分から始める','generate','primary'))}
 </div>
 </section>`;
}
function photoScreen(){return `<section class="screen"><div class="photo-layout"><div class="photo-zone card">${photoURL?`<img src="${photoURL}" alt="選択した食事の写真">`:'<div class="empty-symbol">▣</div>'}<h2>${photoURL?'写真を選択しました':'今日の食卓を一枚'}</h2><p>写真解析はAI接続後に利用できます。現在は手入力で記録できます。</p><div class="toolbar">${button('写真を選択','pick-photo')}${button('手入力','new-record','primary')}</div><input type="file" class="hidden-input" id="photo-file" accept="image/*">${ai.available?button('写真を解析','analyze-photo','primary',photoFile?'':'disabled'):''}<span class="hint">確認するまで写真は外部へ送信されません。</span></div><div class="photo-help card"><span class="tag neutral">${ai.available?'AI接続済み':'AI未設定'}</span><h2 style="margin-top:20px">手入力でも、同じように。</h2><p class="muted">過去の料理から選ぶだけでも記録できます。新しい料理は、そのまま名前を入力してください。</p><ol><li>料理名と種類を入力</li><li>調理日を確認</li><li>カレンダーへ登録</li></ol><p class="hint">写真はこの画面を離れると再表示されない場合があります。写真自体は端末の下書きに保存しません。</p></div></div></section>`;}
function rulesFields(){return `<div class="check-row"><input type="checkbox" id="rule-preferOld" ${state.rules.preferOld?'checked':''}><label for="rule-preferOld">しばらく作っていない料理を優先</label><input aria-label="優先する未調理日数" id="rule-oldDays" type="number" min="1" max="365" value="${state.rules.oldDays}"><span>日</span></div><div class="check-row"><input type="checkbox" id="rule-excludeRecent" ${state.rules.excludeRecent?'checked':''}><label for="rule-excludeRecent">直近の実績を除外</label><input aria-label="除外日数" id="rule-recentDays" type="number" min="1" max="365" value="${state.rules.recentDays}"><span>日</span></div>${[['unique','同じ献立内で料理を重複させない'],['balance','食材・調理法・ジャンルの偏りを抑える'],['newMain','未調理の主菜を1品以上加える']].map(([k,label])=>`<div class="check-row"><input type="checkbox" id="rule-${k}" ${state.rules[k]?'checked':''}><label for="rule-${k}">${label}</label></div>`).join('')}<h3>1日あたりの品数</h3>${state.categories.map(c=>`<div class="check-row"><label for="count-${c.id}">${esc(c.name)}</label><input type="number" min="0" max="5" id="count-${c.id}" value="${state.rules.counts[c.id]||0}"></div>`).join('')}<p class="hint">既存料理の食材・調理法は「料理マスター」で補えます。属性不明の料理には偏り評価が働きません。「未調理」は取得した履歴の範囲で判定します。</p>`;}
function categoryCalendarSettings(){
 return '<h3>分類別カレンダー</h3><p>分類ごとにGoogleカレンダーを指定します。未設定の分類には書き込みません。同じカレンダーを複数の分類に割り当てられます。</p>'+
 state.categories.map(category=>`<label class="field"><span>${esc(category.name)}</span><select data-category-calendar="${esc(category.id)}"><option value="">未設定（保存先なし）</option>${calendars.filter(c=>['owner','writer'].includes(c.accessRole)).map(c=>`<option value="${esc(c.id)}" ${state.categoryCalendars[category.id]===c.id?'selected':''}>${esc(c.summary)}</option>`).join('')}${state.categoryCalendars[category.id]&&!calendars.some(c=>c.id===state.categoryCalendars[category.id])?`<option selected value="${esc(state.categoryCalendars[category.id])}">保存済みの設定（${esc(state.categoryCalendars[category.id])}）</option>`:''}</select></label>`).join('');
}
function additionalCalendarSettings(){
 const candidates=calendars.map(c=>`<label class="check-row"><input type="checkbox" data-extra-calendar="${esc(c.id)}" ${state.extraCalendarIds.includes(c.id)?'checked':''}><span>${esc(c.summary)}${['owner','writer'].includes(c.accessRole)?'':'（読み取り専用）'}</span></label>`).join('');
 const unavailable=state.extraCalendarIds.filter(id=>!calendars.some(c=>c.id===id));
 const remaining=unavailable.map(id=>`<label class="check-row"><input type="checkbox" data-extra-calendar="${esc(id)}" checked><span>保存済みのカレンダー（要再接続）</span></label>`).join('');
 const rules=state.iconRules.map(rule=>{
  const title=String(rule.keyword||''),memo=String(rule.memo||'').replace(/\r?\n/g,' ');
  return `<div class="icon-preset-row" data-preset-id="${esc(rule.id)}" role="listitem" aria-label="${esc([title,memo].filter(Boolean).join('／'))}">
   <button type="button" class="preset-drag-handle" data-reorder-handle="${esc(rule.id)}" aria-label="${esc(title)}の順番を変更" title="長押しして移動。上下矢印キーでも移動可能">≡</button>
   <span class="preset-row-icon">${iconMarkup(rule.icon,rule.color)}</span>
   <span class="preset-row-memo ${memo?'':'no-memo'}" title="${esc(memo||'メモなし')}">${esc(memo||'メモなし')}</span>
   ${button('編集','edit-icon-rule','mini',`data-rule-id="${esc(rule.id)}" aria-label="${esc(title)}のプリセットを編集"`)}
   ${button('削除','remove-icon-rule','mini danger',`data-rule-id="${esc(rule.id)}" aria-label="${esc(title)}のプリセットを削除"`)}
  </div>`;
 }).join('');
 return `<section class="settings-card card"><h2>その他のカレンダー表示</h2><p>選んだカレンダーの予定を献立とは別に表示します。料理履歴には含まれず、予定を編集・削除しません。</p>${candidates||'<p class="hint">Googleでログインするとカレンダーが選べます。</p>'}${remaining}<h3>アイコンと予定プリセット</h3><p>先頭の≡または行を長押しして上下にドラッグすると並べ替えられます。カレンダーでは料理名を先頭、その後をこの順番で表示します。</p><div class="icon-preset-list" role="list" aria-label="プリセットの表示順">${rules||'<p class="hint">プリセットはまだありません。</p>'}</div>${button('＋ プリセットを追加','add-icon-rule','mini')}<p class="hint">同じタイトルでもメモの異なるプリセットを作れます。アイコンを選んで日付をタップすると予定を追加／削除します。</p></section>`;
}
function capturePresetEditorFields(){
 if(!presetEditDraft)return;
 const title=$('#preset-edit-title'),memo=$('#preset-edit-memo'),calendar=$('#preset-edit-calendar'),color=$('#preset-edit-color');
 if(title)presetEditDraft.keyword=title.value;
 if(memo)presetEditDraft.memo=memo.value;
 if(calendar&&calendar.value!==NEW_CALENDAR_VALUE)presetEditDraft.calendarId=calendar.value;
 if(color)presetEditDraft.color=normalizeIconColor(color.value);
}
function updatePresetEditorIconPreview(){
 if(!presetEditDraft)return;
 const field=$('#preset-edit-color');
 const icon=$('#dialog-content .preset-edit-symbols .icon-picker-trigger .preset-svg-icon');
 if(!field||!icon)return;
 const tint=normalizeIconColor(field.value);
 presetEditDraft.color=tint;
 icon.style.color=tint;
 icon.classList.toggle('is-white',tint.toLowerCase()==='#ffffff');
}
function openPresetEditor(ruleId=null){
 const original=ruleId?state.iconRules.find(rule=>rule.id===ruleId):null;
 if(ruleId&&!original)throw Error('編集するプリセットが見つかりません。');
 presetEditOriginalId=original?.id||null;
 presetEditDraft=beginPresetEdit(original,uid().slice(0,10));
 showPresetEditor();
}
function showPresetEditor(){
 const rule=presetEditDraft;
 if(!rule)return;
 const writable=calendars.filter(c=>['owner','writer'].includes(c.accessRole));
 const chosen=String(rule.calendarId||''),missing=chosen&&!writable.some(c=>c.id===chosen);
 const options=`<option value="" ${chosen?'':'selected'}>未設定（表示の置き換えのみ）</option>${writable.map(c=>`<option value="${esc(c.id)}" ${chosen===c.id?'selected':''}>${esc(c.summary)}</option>`).join('')}${missing?`<option value="${esc(chosen)}" selected>保存済みのカレンダー（再接続して確認）</option>`:''}<option value="${NEW_CALENDAR_VALUE}">＋ 新規作成…</option>`;
 modal(presetEditOriginalId?'プリセットを編集':'プリセットを追加',
  `<div class="preset-edit-symbols">
    <button type="button" class="icon-picker-trigger" data-action="open-icon-picker" title="アイコンを変更" aria-label="アイコンを変更">${iconMarkup(rule.icon,rule.color)}<span aria-hidden="true">▾</span></button>
    <label class="preset-edit-color"><span>アイコンの色</span><input id="preset-edit-color" data-preset-draft type="color" value="${normalizeIconColor(rule.color)}"></label>
   </div>
   <label class="field"><span>タイトル（必須）</span><input id="preset-edit-title" data-preset-draft type="text" maxlength="80" required value="${esc(rule.keyword)}" placeholder="例：可燃ごみ"></label>
   <label class="field"><span>メモ</span><textarea id="preset-edit-memo" data-preset-draft maxlength="2000" rows="2" placeholder="カレンダーの予定の説明欄に保存します">${esc(rule.memo)}</textarea><small>同じタイトルでもメモが違えば別のプリセットにできます。</small></label>
   <label class="field"><span>予定の登録先カレンダー</span><select id="preset-edit-calendar" data-preset-draft>${options}</select></label>`,
  button('キャンセル','close-dialog')+button('決定','save-preset-editor','primary'));
}
function openCalendarCreation(ruleId){
 if(!api.connected)throw Error('Googleへログインしてから新しいカレンダーを作成してください。');
 if(!presetEditDraft||presetEditDraft.id!==ruleId)throw Error('編集中のプリセットがありません。');
 const zone=state.timeZone||'Asia/Tokyo';
 modal('カレンダーを新規作成',
  `<label class="field"><span>カレンダー名（必須）</span><input id="new-calendar-name" type="text" maxlength="100" placeholder="例：家族の予定" required autocomplete="off"></label>
  <label class="field"><span>説明（任意）</span><textarea id="new-calendar-description" maxlength="1000" rows="2" placeholder="用途など"></textarea></label>
  <label class="field"><span>タイムゾーン</span><input id="new-calendar-timezone" type="text" list="new-calendar-timezone-list" maxlength="80" value="${esc(zone)}" autocomplete="off"><datalist id="new-calendar-timezone-list"><option value="Asia/Tokyo"><option value="Etc/UTC"><option value="America/Los_Angeles"><option value="Europe/London"></datalist></label>
  <p class="hint">Googleカレンダーに新規作成して、編集中のプリセットの登録先に選びます。プリセット自体の登録は「決定」で行います。</p>`,
  button('戻る','return-preset-editor')+button('作成して選択','confirm-create-calendar','primary',`data-rule-id="${esc(ruleId)}"`));
}
function settingsScreen(){return `<section class="screen"><div class="settings-grid scroll"><section class="settings-card card"><h2>Googleカレンダー</h2><p>Googleでログインし、分類ごとのカレンダーを設定してください。</p>${!GOOGLE_CLIENT_ID?'<p class="hint">Googleログインの初期設定が完了していません。開発者による設定が必要です。</p>':''}<div class="toolbar">${button(api.connected?'再接続':authReady?'Googleでログイン':authLoadError?'認証読み込みを再試行':'Google認証を準備中','connect','primary',busy||(!api.connected&&!authReady&&!authLoadError)?'disabled':'')}${button('接続を解除','disconnect','',api.connected?'':'disabled')}</div><div class="check-row"><input type="checkbox" id="keep-connected" ${api.keepConnected?'checked':''}><label for="keep-connected">この端末で接続を保持（有効期限内）</label></div><p class="hint">オンにすると短期のGoogle認証情報を端末のブラウザに保存し、アプリを閉じても期限内は認証画面を出さずに接続します。共有端末ではオフを推奨します。</p>${calendarLoadError?`<p class="hint" role="alert">${esc(calendarLoadError)}</p>`:''}${api.connected&&!calendars.length?button('カレンダー一覧を再取得','refresh-calendars','mini'):''}${categoryCalendarSettings()}<label class="field"><span>カレンダーの自動更新間隔</span><select id="calendar-refresh-minutes">${CALENDAR_REFRESH_MINUTES.map(minutes=>`<option value="${minutes}" ${state.calendarRefreshMinutes===minutes?'selected':''}>${minutes===0?'自動更新しない':minutes+'分ごと'}</option>`).join('')}</select><small>画面の表示中、Googleに接続しているときだけ自動取得します。画面に戻ったときや通信復帰時も、更新間隔を過ぎていれば再取得します。入力途中の内容は変更しません。</small></label><label class="field"><span>履歴の取得開始日</span><div class="history-date-control"><input type="date" id="history-from" value="${state.from}"></div><small>この日以降の履歴を料理マスターに利用します。取得対象は日本時間の日付基準です。</small></label>${button('履歴を再取得','sync','full',busy||!api.connected||!hasSyncedCalendars()?'disabled':'')}<p class="hint" style="margin-top:12px">接続を保持する場合、短期アクセストークンをブラウザに保存します。Googleカレンダーの内容は保存しません。認証の期限切れ時は、共通ステータスバーから再接続できます。</p></section><section class="settings-card card"><h2>他の端末へ設定を引き継ぐ</h2><p>Googleドライブのアプリ専用領域に設定をバックアップします。同じGoogleアカウントで復元してください。</p><div class="toolbar">${button('Driveにバックアップ','drive-save','mini primary')}${button('Driveから復元','drive-load','mini')}</div><p class="hint">分類・カレンダーの割り当て・生成ルール・配色・表示設定・手動登録した料理マスター・献立生成の下書きを共有します。調理実績やGoogleの認証情報は含みません。</p><div class="check-row"><input id="drive-auto" type="checkbox" ${drive.autoEnabled?'checked':''}><label for="drive-auto">Driveの設定を自動同期する（保存・読み込み）</label></div><div class="drive-sync-tools"><span id="drive-sync-state" class="hint" role="status"></span>${button('今すぐ同期','drive-sync-now','mini',drive.autoEnabled?'':'disabled')}</div><p class="hint">この端末で有効にすると、設定変更をDriveへ自動保存し、アプリ起動時・復帰時に他端末の変更を自動取得します。各端末で個別に有効化してください。初回はDriveに既存のバックアップがあればそちらを取り込みます。</p><p class="hint">同時変更で食い違った場合は自動上書きせず、手動で保存・復元を選べます。</p><p class="hint">認証は短時間だけ有効です。期限切れ後はステータスバーから再接続してください。バックグラウンドでは同期しません。手動保存・復元も引き続き利用できます。</p></section><section class="settings-card card"><h2>配色テーマ</h2><p>色と明るさを、それぞれ選べます。</p><div class="theme-options">${Object.entries(colors).map(([key,c])=>`<button class="swatch ${state.theme.color===key?'active':''}" style="--swatch:${c.light}" data-action="theme" data-color="${key}" aria-label="${c.name}" title="${c.name}" aria-pressed="${state.theme.color===key}"></button>`).join('')}</div><label class="field"><span>選択色：${colors[state.theme.color]?.name||'緑'}</span><select id="theme-mode"><option value="light" ${state.theme.mode==='light'?'selected':''}>ライト</option><option value="dark" ${state.theme.mode==='dark'?'selected':''}>ダーク</option><option value="auto" ${state.theme.mode==='auto'?'selected':''}>OSに合わせる</option></select></label><h3 style="margin-top:30px">候補と料理マスター</h3><div class="check-row"><input id="seed-enabled" type="checkbox" ${state.seedEnabled?'checked':''}><label for="seed-enabled">初期候補の料理を使う</label></div><p>初期候補は実績ではありません。過去の履歴はカレンダーから自動でまとめます。</p>${button('料理マスターを開く','master','full')}</section><section class="settings-card card"><h2>献立生成ルール</h2>${rulesFields()}</section><section class="settings-card card"><h2>料理の分類</h2><p>分類名を変えても、これまでの料理との対応は維持します。</p>${state.categories.map(c=>`<div class="category-row"><input aria-label="${esc(c.name)}の分類名" data-category-name="${c.id}" value="${esc(c.name)}" maxlength="20">${button('削除','remove-category','mini danger',`data-category="${c.id}" ${c.id==='main'?'disabled':''}`)}</div>`).join('')}${button('＋ 分類を追加','add-category','full')}<h2 style="margin-top:28px">AI拡張</h2><span class="tag neutral">${ai.available?'接続済み':'未設定'}</span><p style="margin-top:12px">献立選定と写真解析の接続基盤を用意しています。キーの保存方針が決まるまでは入力・保存しません。通常の献立管理はAIなしで利用できます。</p><h3>この端末のデータ</h3><p>分類・カレンダーの選択・下書き・表示設定は端末に保存します。認証期限が切れても、分類の設定は保持されます。実績の正本はGoogleカレンダーです。</p>${button('設定・下書きを書き出す','export','mini')} ${button('読み込む','import','mini')}<input type="file" accept="application/json,.json" class="hidden-input" id="import-file"><p class="hint" style="margin-top:12px">書き出しには料理履歴を含みません。確定した料理の情報はGoogleカレンダーが正本です。</p></section>${additionalCalendarSettings()}</div></section>`;}
function modal(title,body,foot=''){ $('#dialog-content').innerHTML=`<div class="dialog-head"><h2>${title}</h2>${button('×','close-dialog','icon-button','aria-label="閉じる"')}</div><div class="dialog-body">${body}<p class="form-error" id="dialog-error" role="alert"></p></div>${foot?`<div class="dialog-foot">${foot}</div>`:''}`;if(!$('#dialog').open)$('#dialog').showModal();}
function closeModal(){cancelPlaceLookup();$('#dialog').close();editor=null;presetEditDraft=null;presetEditOriginalId=null;}
function categoryOptions(selectedId){return state.categories.map(c=>`<option value="${esc(c.id)}" ${c.id===selectedId?'selected':''}>${esc(c.name)}</option>`).join('');}
function dishRows(dishes){
 return dishes.map((d,i)=>`<div class="dish-editor">
  <select data-editor-category="${i}" aria-label="${i+1}品目の分類">${categoryOptions(d.category)}</select>
  <div class="dish-input-group">
   <input id="record-dish-${i}" data-editor-name="${i}" aria-label="${i+1}品目の料理名" value="${esc(d.name)}" placeholder="料理名" maxlength="100" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-controls="dish-suggestions-${i}">
   <div id="dish-suggestions-${i}" class="dish-suggestions" role="listbox" aria-label="料理名の候補" hidden></div>
  </div>
  ${button('×','editor-remove','danger',`data-index="${i}" aria-label="${i+1}品目を削除"`)}
 </div>`).join('');
}
// Debounced suggestions prevent firing a public geocoding request per keystroke.
let placeRequestTimer=null,placeRequestAbort=null,placeRequestId=0,lastPlaceRequest=0;
const placeCache=new Map(),placeCandidatePool=new Map();
function rememberPlaceCandidates(batch){
 for(const place of batch){
  const key=place.value+'|'+place.detail;
  if(placeCandidatePool.has(key))placeCandidatePool.delete(key);
  placeCandidatePool.set(key,place);
 }
 while(placeCandidatePool.size>300)placeCandidatePool.delete(placeCandidatePool.keys().next().value);
}
function cancelPlaceLookup(){
 if(placeRequestTimer!==null)clearTimeout(placeRequestTimer);
 placeRequestTimer=null;placeRequestAbort?.abort();placeRequestAbort=null;placeRequestId++;
}
function hidePlaceSuggestions(){
 const popup=$('#place-popup'),list=$('#place-suggestions');
 if(list)list.innerHTML='';
 if(popup)popup.hidden=true;
 const status=$('#place-search-status');if(status)status.textContent='';
 $('#record-location')?.setAttribute('aria-expanded','false');
 $('#place-search-active')?.setAttribute('aria-expanded','false');
}
function activePlaceInput(){
 return $('#place-search-sheet:not([hidden]) #place-search-active')||$('#record-location');
}
function positionPlaceSuggestions(){
 const sheet=$('#place-search-sheet');
 if(sheet&&!sheet.hidden){
  // When iOS opens the keyboard the visual viewport changes independently
  // of the layout viewport. Keep the input visible at its top, not above it.
  const viewport=globalThis.visualViewport;
  sheet.style.top=Math.round(viewport?.offsetTop??0)+'px';
  sheet.style.left=Math.round(viewport?.offsetLeft??0)+'px';
  sheet.style.width=Math.round(viewport?.width??innerWidth)+'px';
  sheet.style.height=Math.round(viewport?.height??innerHeight)+'px';
  return;
 }
 const popup=$('#place-popup'),field=$('#record-location'),dialog=$('#dialog');
 if(!popup||popup.hidden||!field?.isConnected||!dialog?.open)return;
 const input=field.getBoundingClientRect(),frame=dialog.getBoundingClientRect();
 const visible=globalThis.visualViewport;
 const bottom=Math.min(frame.bottom-8,(visible?.offsetTop??0)+(visible?.height??innerHeight));
 const room=Math.max(50,Math.min(310,bottom-input.bottom-5));
 const width=Math.max(80,Math.min(input.width,frame.width-16));
 popup.style.left=Math.max(frame.left+8,Math.min(input.left,frame.right-width-8))+'px';
 popup.style.width=width+'px';
 popup.style.maxHeight=room+'px';
 popup.style.top=input.bottom+3+'px';
}
function openPlaceSearchSheet(){
 const sheet=$('#place-search-sheet'),field=$('#record-location');
 if(!sheet||!field||!editor||!sheet.hidden)return;
 const input=$('#place-search-active'),popup=$('#place-popup');
 if(!input||!popup)return;
 input.value=field.value;
 sheet.querySelector('.place-sheet-results').appendChild(popup);
 sheet.hidden=false;
 $('#dialog').classList.add('place-search-open');
 hidePlaceSuggestions();
 positionPlaceSuggestions();
 input.focus({preventScroll:true});
 if(input.value.trim().length>=2)queuePlaceLookup(input);
}
function closePlaceSearchSheet(){
 const sheet=$('#place-search-sheet');
 if(!sheet||sheet.hidden)return;
 const input=$('#place-search-active'),field=$('#record-location'),popup=$('#place-popup');
 if(input&&field){
  field.value=input.value;
  if(editor)editor.location=input.value;
 }
 cancelPlaceLookup();
 hidePlaceSuggestions();
 if(popup)$('#dialog-content').appendChild(popup);
 sheet.hidden=true;
 $('#dialog').classList.remove('place-search-open');
 if(document.activeElement===input)input.blur();
}
function showPlaceChoices(field,places){
 const list=$('#place-suggestions'),popup=$('#place-popup');
 if(!field?.isConnected||!list||!popup||field!==activePlaceInput())return;
 list.innerHTML=places.map(place=>'<button type="button" class="place-suggestion" role="option" data-action="pick-location" data-value="'+esc(place.value)+'"><strong>'+esc(place.name)+'</strong><small>'+esc(place.detail||'住所の登録なし')+'</small></button>').join('');
 popup.hidden=places.length===0&&!$('#place-search-status')?.textContent;
 field.setAttribute('aria-expanded',String(places.length>0));
 positionPlaceSuggestions();
}
function updatePlaceSearchMessage(message){
 const target=$('#place-search-status'),popup=$('#place-popup');
 if(target)target.textContent=message;
 if(popup){
  popup.hidden=!message&&!$('#place-suggestions')?.children.length;
  positionPlaceSuggestions();
 }
}
function queuePlaceLookup(field,{immediate=false}={}){
 cancelPlaceLookup();hidePlaceSuggestions();
 if(!field?.isConnected||!editor)return;
 const query=String(field.value||'').trim();
 if(Array.from(query).length<2){updatePlaceSearchMessage('');return;}
 if(!navigator.onLine){
  updatePlaceSearchMessage('オフラインのため候補を取得できません。入力した場所はそのまま保存できます。');
  return;
 }
 const seeded=filterPlaceCandidates([...placeCandidatePool.values()],query);
 if(seeded.length)showPlaceChoices(field,seeded);
 const cached=placeCache.get(query);
 if(cached){
  showPlaceChoices(field,cached);
  updatePlaceSearchMessage(cached.length?'店舗名・住所にすべてのキーワードが一致する候補です。':'候補が見つかりません。入力を短くするか、そのまま保存できます。');
  return;
 }
 const id=placeRequestId;
 const delay=Math.max(immediate?0:650,1000-(Date.now()-lastPlaceRequest));
 updatePlaceSearchMessage('候補を検索しています…');
 placeRequestTimer=setTimeout(async()=>{
  placeRequestTimer=null;
  if(id!==placeRequestId||!field.isConnected)return;
  const controller=new AbortController();placeRequestAbort=controller;
  lastPlaceRequest=Date.now();
  try{
   const places=await searchPlaces(query,{
    signal:controller.signal,online:!!navigator.onLine,
    seed:[...placeCandidatePool.values()],
    onCandidates:batch=>{
     if(id!==placeRequestId||!field.isConnected)return;
     rememberPlaceCandidates(batch);
     const interim=filterPlaceCandidates([...placeCandidatePool.values()],query);
     if(interim.length)showPlaceChoices(field,interim);
    }
   });
   if(id!==placeRequestId||!field.isConnected||field.value.trim()!==query)return;
   if(placeCache.size>=25)placeCache.delete(placeCache.keys().next().value);
   placeCache.set(query,places);showPlaceChoices(field,places);
   updatePlaceSearchMessage(places.length?'店舗名・住所にすべてのキーワードが一致する候補です。':
    '一致する候補がありません。キーワードを減らすか、場所をそのまま保存できます。');
  }catch(error){
   if(id===placeRequestId&&error?.name!=='AbortError')
    updatePlaceSearchMessage('候補を取得できませんでした。入力した場所はそのまま保存できます。');
  }finally{if(placeRequestAbort===controller)placeRequestAbort=null;}
 },delay);
}
function pickPlaceSuggestion(button){
 const field=activePlaceInput(),original=$('#record-location');
 if(!editor||!button||!field)return;
 const name=button.dataset.value||'';
 if(!name)return;
 cancelPlaceLookup();
 field.value=name;if(original)original.value=name;editor.location=name;
 closePlaceSearchSheet();
 hidePlaceSuggestions();updatePlaceSearchMessage('');field.blur();
}
function hideDishSuggestions(){
 for(const list of document.querySelectorAll('.dish-suggestions'))list.hidden=true;
 for(const input of document.querySelectorAll('[data-editor-name]'))input.setAttribute('aria-expanded','false');
}
function showDishSuggestions(input){
 if(!input||!editor)return;
 const index=Number(input.dataset.editorName);
 const list=input.closest('.dish-input-group')?.querySelector('.dish-suggestions');
 if(!list||!editor.dishes[index])return;
 const choices=dishSuggestions(master(),input.value,editor.dishes[index].category,8);
 list.innerHTML=choices.map((d,n)=>`<button type="button" class="dish-suggestion" role="option" data-action="suggest-record-dish" data-index="${index}" data-name="${esc(d.name)}"><span>${esc(d.name)}</span><small>${esc(categoryName(d.category))}</small></button>`).join('');
 list.hidden=!choices.length;
 input.setAttribute('aria-expanded',String(!!choices.length));
}
function pickRecordDishSuggestion(button){
 if(!editor||!button)return;
 const index=Number(button.dataset.index);
 const selected=master().find(d=>d.name===button.dataset.name);
 const input=document.querySelector(`[data-editor-name="${index}"]`);
 if(!selected||!input||!selectRecordDish(editor,index,selected))return;
 // Update the live input before focus/blur events; replacing the modal's HTML
 // here can discard the selection on iOS Safari during a touch sequence.
 input.value=selected.name;
 const category=input.closest('.dish-editor')?.querySelector('[data-editor-category]');
 if(category)category.value=selected.category;
 hideDishSuggestions();
 input.blur();
}
function openRecord(record=null,{date=today(),dishes=null}={}){
 editor=record?structuredClone(record):{id:uid(),date,status:'actual',location:'',dishes:dishes?structuredClone(dishes):[{name:'',category:'main'}],owned:true,new:true,scope:scopeKey()};
 editor.scope??=scopeKey();editor.location??=editor.raw?.location||'';editor.status='actual';drawRecord();
}
function drawRecord(){cancelPlaceLookup();const legacy=!editor.owned;modal(editor.new?'調理実績を登録':'調理実績を編集',`${legacy?'<div class="banner">保存すると、元のGoogleカレンダーの予定を直接更新します。日付と時刻などは維持します。</div>':''}<label class="field"><span>調理した日</span><span class="dialog-date-control"><input id="record-date" type="date" value="${editor.date}" ${legacy?'disabled':''}></span></label><div class="field place-field"><label for="record-location" class="place-input-label">場所（任意・外食の場合に入力）</label><input id="record-location" type="text" value="${esc(editor.location||'')}" placeholder="店名・支店名・住所で検索" maxlength="500" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="place-suggestions" aria-expanded="false"><div id="place-popup" class="place-popup" hidden><p id="place-search-status" class="place-search-status" role="status" aria-live="polite"></p><div id="place-suggestions" class="place-suggestions" role="listbox" aria-label="場所の候補"></div><small class="place-popup-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> / <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a></small></div></div><h3>料理</h3>${dishRows(editor.dishes)}${button('＋ 料理を追加','editor-add','text-button')}<p class="hint">「カレンダーに保存」でGoogleカレンダーへ反映します。閉じると未保存の入力は破棄されます。</p>`,`${!editor.new?button('削除','delete-record','danger'):''}${button('閉じる','close-dialog')}${button('カレンダーに保存','save-record','primary',busy?'disabled':'')}`);
 const popup=$('#place-popup');
 if(popup)$('#dialog-content').appendChild(popup);
 const sheet=document.createElement('div');
 sheet.id='place-search-sheet';sheet.className='place-search-sheet';sheet.hidden=true;
 sheet.innerHTML=`<div class="place-sheet-bar"><span class="place-sheet-search-icon" aria-hidden="true">⌕</span><input type="search" id="place-search-active" autocomplete="off" enterkeyhint="search" maxlength="500" value="${esc(editor.location||'')}" placeholder="店名・支店名・住所を入力" aria-label="場所を検索" role="combobox" aria-autocomplete="list" aria-controls="place-suggestions" aria-expanded="false"><button type="button" data-action="close-place-search" aria-label="場所の検索を閉じる">×</button></div><div class="place-sheet-results"></div><small class="place-sheet-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> / <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a></small>`;
 $('#dialog-content').appendChild(sheet);
}
async function saveRecord(){
 const current=structuredClone(editor);
 current.dishes=validateDishes(current.dishes);
 current.location=String(current.location||'').trim();
 if(!api.connected)throw Error('Googleにログインしてから保存してください。入力画面は保持されています。');
 const sourceId=current.calendarId||primaryCalendarId();
 if(!current.new&&current.scope!==scopeKeyFor(sourceId))throw Error('編集中にカレンダーの設定が変更されました。保存先を確認してください。');
 const targets=splitRecordByCalendar(current,'',state.categoryCalendars);
 if(!current.new&&(targets.length!==1||targets[0].calendarId!==sourceId))
  throw Error('既存実績のカレンダー間移動は未対応です。元の予定は変更していません。移動先に新規登録してから元の実績を削除してください。');
 busy=true;updateConnection();
 $('#dialog-content').querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
 try{
  if(current.new){
   for(const {calendarId,record} of targets){
    const result=await api.insert(calendarId,record);
    const bucket=dataFor(calendarId);
    bucket.events=bucket.events.filter(e=>e.id!==result.id);
    bucket.events.push(result);
   }
  }else{
   const result=await api.update(sourceId,current);
   const bucket=dataFor(sourceId);
   bucket.events=bucket.events.filter(e=>e.id!==result.id);
   bucket.events.push(result);
  }
  closeModal();render();notify('Googleカレンダーに保存しました。');
 }catch(error){
  throw Error(error.message+' 分類別の保存では一部が登録済みの可能性があります。同期して内容を確認してください。');
 }finally{busy=false;updateConnection();if(editor)drawRecord();}
}

function masterModal(){const items=master().filter(d=>normalize(d.name).includes(normalize(masterQuery)));modal('料理マスター',`<p class="hint">最終調理日の新しい順。表記統一と属性の編集は、この端末に保存します。過去の予定は変更しません。</p><div class="master-toolbar"><input id="master-search" aria-label="料理を検索" placeholder="料理を検索" value="${esc(masterQuery)}">${button('＋ 新規','add-master','primary')}</div><table class="master-table"><thead><tr><th>料理</th><th>最終調理日</th><th class="optional">回数</th><th></th></tr></thead><tbody>${items.map(d=>`<tr><td>${esc(d.name)}<br><small>${esc(categoryName(d.category))}</small></td><td>${d.lastDate||'未調理'}</td><td class="optional">${d.count}</td><td>${button('編集','edit-master','mini',`data-key="${esc(d.key)}"`)}</td></tr>`).join('')}</tbody></table>${!items.length?'<p class="hint">料理が見つかりません。</p>':''}`);}
let editingMaster=null,editingPlan=null;
function editMaster(key=null){editingMaster=key;const d=master().find(d=>d.key===key)||{name:'',category:'main',protein:'不明',method:'不明',genre:'不明',dates:[]};modal(key?'料理の情報':'料理を追加',`<label class="field"><span>料理名（変更で表記を統一）</span><input id="master-name" value="${esc(d.name)}" maxlength="100" list="dish-options"></label><datalist id="dish-options">${master().map(d=>`<option value="${esc(d.name)}">`).join('')}</datalist><label class="field"><span>分類</span><select id="master-category">${categoryOptions(d.category)}</select></label>${[['protein','主な食材',['不明','肉','魚','野菜・豆','卵']],['method','調理法',['不明','焼く','煮る','炒める','揚げる','蒸す','ゆでる','和える']],['genre','ジャンル',['不明','和食','洋食','中華','その他']]].map(([k,label,values])=>`<label class="field"><span>${label}</span><select id="master-${k}">${values.map(v=>`<option ${d[k]===v?'selected':''}>${v}</option>`).join('')}</select></label>`).join('')}${d.dates.length?`<details><summary>過去の調理日（${d.count}回）</summary><p class="hint">${d.dates.join(' / ')}</p></details>`:''}<p class="hint">同じ名前へ変更すると、調理履歴を統合して表示します。</p>`,button('戻る','master')+button('保存','save-master','primary'));}
function saveMaster(){const dish=validateDishes([{name:$('#master-name').value,category:$('#master-category').value,protein:$('#master-protein').value,method:$('#master-method').value,genre:$('#master-genre').value}])[0];const key=normalize(dish.name);if(editingMaster&&editingMaster!==key){if(resolveName(dish.name,data().aliases)&&normalize(resolveName(dish.name,data().aliases))===editingMaster)throw Error('この名前は元の料理へ統一済みです。別の名前を指定してください。');data().aliases[editingMaster]=dish.name;}data().metadata[key]={category:dish.category,protein:dish.protein,method:dish.method,genre:dish.genre};if(!editingMaster||!master().some(d=>d.key===key))data().manual.push(dish);persist();masterModal();render();}
function editPlanDish(dayIndex,dishIndex=null){editingPlan={dayIndex,dishIndex};const d=state.draft[dayIndex].dishes[dishIndex]||{name:'',category:'main'};modal(dishIndex===null?'料理を追加':'料理を差し替える',`<label class="field"><span>料理名</span><input id="plan-name" value="${esc(d.name)}" list="plan-options" maxlength="100" placeholder="料理名を入力・候補から選択"></label><datalist id="plan-options">${master().map(d=>`<option value="${esc(d.name)}">${esc(categoryName(d.category))}</option>`).join('')}</datalist><label class="field"><span>分類</span><select id="plan-category">${categoryOptions(d.category)}</select></label><p class="hint">変更は下書きに反映されます。カレンダーには登録されません。</p>`,`${dishIndex!==null?button('この料理を削除','delete-plan-dish','danger'):''}${button('反映','save-plan-dish','primary')}`);}
function checkDraft(){issues=validatePlan(state.draft,state.rules,master());persist();render();}
async function sync({automatic=false}={}){
 if(automatic&&(presetFlushing||presetQueue.size))return;
 if(!automatic&&presetQueue.size&&!presetFlushing)await flushPendingPresets();
 if(automatic&&!isCalendarRefreshDue({
  minutes:state.calendarRefreshMinutes,lastSyncAt:lastCalendarSync,lastAttemptAt:lastCalendarAttempt,
  now:Date.now(),connected:api.connected,online:navigator.onLine!==false,
  visible:!document.hidden,busy:busy||driveAutoBusy,configured:calendarAutoReady&&hasSyncedCalendars()
 }))return;
 if(busy)return;
 if(!api.connected)throw Error('Googleへログインしてから同期してください。');
 if(!hasSyncedCalendars())throw Error('表示または登録先のカレンダーを設定してください。');
 if(state.from>today())throw Error('履歴の取得開始日は今日以前にしてください。');
 lastCalendarAttempt=Date.now();
 busy=true;updateConnection();
 if(!automatic)notify('カレンダーの履歴を取得しています…');
 try{
  const year=Math.max(new Date().getFullYear()+2,month.getFullYear()+1);
  const ids=syncedCalendarIds();
  const batches=await Promise.all(ids.map(async calendarId=>({
   calendarId,events:await api.events(calendarId,state.from,`${year}-01-01`)
  })));
  const changed=batches.some(({calendarId,events})=>{
   const previous=dataFor(calendarId).events;
   return previous.length!==events.length||events.some((event,i)=>event.id!==previous[i]?.id||event.etag!==previous[i]?.etag);
  });
  const completedAt=Date.now();
  for(const {calendarId,events} of batches){
   const bucket=dataFor(calendarId);
   bucket.events=events;bucket.lastSync=completedAt;
  }
  lastCalendarSync=completedAt;
  if(!automatic||changed)render();
  if(!automatic){
   const count=batches.reduce((n,b)=>n+b.events.length,0);
   notify(`${ids.length}件のカレンダーから${count}件の予定を取得しました。`);
  }else if(currentNotice.startsWith('カレンダーの自動更新に失敗しました')){
   notify('Googleカレンダーの自動更新が再開しました。');
  }
 }catch(error){
  if(!automatic)throw error;
  notify('カレンダーの自動更新に失敗しました：'+error.message);
 }finally{busy=false;updateConnection();}
}
function autoRefreshCalendar(){return sync({automatic:true});}

function exportState(){const blob=new Blob([JSON.stringify({format:'kondate-settings-v1',state:storedState(state)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`kondate-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let imported=null,driveImported=null,driveImportedRaw=null;
function driveBackupTime(value){const date=new Date(value||'');return Number.isFinite(date.getTime())?date.toLocaleString('ja-JP'):'保存日時不明';}
function setDriveSyncStatus(message,successful=false){
 driveSyncStatus=String(message||'');
 if(successful){
  driveLastSuccessAt=Date.now();
  setDriveMeta(DRIVE_LAST_SUCCESS,String(driveLastSuccessAt));
 }
 showStatus();
}
function driveBackupSummary(backup){const settings=backup.settings;return `<p>保存日時：<strong>${esc(driveBackupTime(backup.updatedAt))}</strong></p><p>分類：${settings.categories?.length||state.categories.length}件／手動の料理：${Object.values(backup.master||{}).reduce((n,s)=>n+s.manual.length,0)}品</p>`;}
function markDriveDirty(){
 drivePending=true;setDriveMeta(DRIVE_DIRTY,'1');
 setDriveSyncStatus('端末側の設定変更を送信待ち');
 if(driveAutoTimer)clearTimeout(driveAutoTimer);
 if(drive.connected&&driveAutoReady){
  driveAutoTimer=setTimeout(()=>{driveAutoTimer=null;autoDriveSync();},1400);
 }
}
async function markDriveSynced(version,snapshot){
 // Track the shared content separately from Drive's changing file version.
 driveCloudRevision=version||'';
 driveBaseDigest=await driveSettingsDigest(snapshot);
 setDriveMeta(DRIVE_REVISION,driveCloudRevision);
 setDriveMeta(DRIVE_DIGEST,driveBaseDigest);
 // Keep edits made while a network request was in flight.
 drivePending=(await driveSettingsDigest(createDriveSnapshot(state)))!==driveBaseDigest;
 setDriveMeta(DRIVE_DIRTY,drivePending?'1':'');
 return drivePending;
}
async function applyRemoteSettings(remoteVersion,remoteSnapshot){
 const saved=readDriveSnapshot(remoteSnapshot,state,validateImport);
 const wasBooting=driveAutoBooting;driveAutoBooting=true;
 try{
  restoreDriveSnapshot(state,saved);state.iconRules=normalizePresetRules(state.iconRules);
  state.categoryCalendars=migrateCategoryCalendars(state.categories,state.categoryCalendars,state.calendarId);
  state.calendarId='';state.calendarName='';
  persist();
 }finally{driveAutoBooting=wasBooting;}
 const newerLocalChanges=await markDriveSynced(remoteVersion,remoteSnapshot);
 render();
 if(api.connected&&hasSyncedCalendars()){
  try{await sync();}catch(error){notify('Drive設定を取得しましたがカレンダー同期に失敗しました：'+error.message);return newerLocalChanges;}
 }
 notify('Googleドライブから新しい設定を同期しました。');
 return newerLocalChanges;
}
async function autoDriveSync(){
 if(!drive.autoEnabled||!drive.connected||driveAutoBusy)return;
 driveAutoBusy=true;
 setDriveSyncStatus('Driveと照合中…');
 let followUp=false;
 try{
  const file=await drive.find();
  const remoteRevision=String(file?.version||'');
  const localSnapshot=createDriveSnapshot(state);
  const localDigest=await driveSettingsDigest(localSnapshot);
  const remoteSnapshot=file?await drive.load(file.id):null;
  const remoteDigest=remoteSnapshot?await driveSettingsDigest(remoteSnapshot):'';
  // During asynchronous Drive reads, local checkbox edits may occur.
  // A stale snapshot must not overwrite those edits when download is selected.
  const latestLocalDigest=await driveSettingsDigest(createDriveSnapshot(state));
  if(latestLocalDigest!==localDigest){
   followUp=true;
   setDriveSyncStatus('通信中の変更を検知・再照合を予約');
   return;
  }
  driveAutoReady=true;
  const decision=decideDriveSync({
   remoteExists:!!file,localDigest,remoteDigest,
   baseDigest:driveBaseDigest,pending:drivePending,
   remoteRevision,baseRevision:driveCloudRevision
  });
  if(decision==='equal'){
   // Identical contents are never a conflict, even when the revision changed.
   followUp=await markDriveSynced(remoteRevision,localSnapshot);
   setDriveSyncStatus('同期済み（表示カレンダー '+state.extraCalendarIds.length+'件）',true);
   return;
  }
  if(decision==='download'){
   followUp=await applyRemoteSettings(remoteRevision,remoteSnapshot);
   setDriveSyncStatus('Driveから受信済み（表示カレンダー '+state.extraCalendarIds.length+'件）',true);
   return;
  }
  if(decision==='conflict'){
   setDriveSyncStatus('競合：別端末と設定が異なります。自動上書きは停止中');
   notify('⚠ Driveの設定が競合しています。設定画面で手動保存か復元を選んでください。');
   return;
  }
  if(decision==='missing'){
   setDriveSyncStatus('同期先が見つかりません');
   notify('⚠ Driveの同期先が見つかりません。設定画面でバックアップを確認してください。');
   return;
  }
  const nextRevision=await drive.saveChecked(localSnapshot,remoteRevision);
  followUp=await markDriveSynced(nextRevision,localSnapshot);
  setDriveSyncStatus('Driveへ送信済み（表示カレンダー '+localSnapshot.settings.extraCalendarIds.length+'件）',true);
  notify('設定をGoogleドライブへ自動保存しました。');
 }catch(error){
  setDriveSyncStatus('失敗：'+error.message);
  notify('Drive自動同期：'+error.message);
 }finally{
  driveAutoBusy=false;
  if(followUp&&drive.autoEnabled&&drive.connected&&!driveAutoTimer){
   driveAutoTimer=setTimeout(()=>{driveAutoTimer=null;autoDriveSync();},1400);
  }
  showStatus();
 }
}

// Sign in only to services with an expired session. Initial sign-in is unchanged.
async function reauthenticateExpiredGoogle(){
 if(!GOOGLE_CLIENT_ID)throw Error('Googleログインの設定が完了していません。');
 if(!authReady||!globalThis.google?.accounts?.oauth2){
  prepareGoogleIdentity();
  throw Error('Google認証を準備しています。少し待って再試行してください。');
 }
 // Start OAuth immediately in the click handler; no preceding asynchronous work.
 const refreshing=renewExpiredGoogleServices(api,drive,GOOGLE_CLIENT_ID);
 const refreshed=await refreshing;
 currentNotice='';showStatus();
 if(refreshed.calendar){
  if(!await loadCalendarOptions()){notify(calendarLoadError);return;}
 }
 if(refreshed.drive&&drive.autoEnabled)await autoDriveSync();
 if(refreshed.calendar&&hasSyncedCalendars())await sync();
 const which=refreshed.calendar&&refreshed.drive?'カレンダーとDrive':refreshed.calendar?'カレンダー':'Drive';
 notify(which+'の再認証が完了しました。');
}
function prepareDriveAuthorization(){
 if(!globalThis.google?.accounts?.oauth2){prepareGoogleIdentity();throw Error('Googleの認証を準備しています。準備完了後にもう一度操作してください。');}
}
async function loadCalendarOptions(){
 try{
  const found=await api.calendars();
  calendars=found;
  calendarAutoReady=true;
  calendarLoadError=found.length?'':'Googleへのログインは成功しましたが、カレンダー一覧が0件でした。Googleカレンダーに利用可能なカレンダーがあるか確認してください。';
  render();
  return found.length>0;
 }catch(error){
  calendars=[];
  calendarLoadError='Googleログインは成功しましたが、カレンダー一覧を取得できませんでした。'+error.message;
  render();
  throw error;
 }
}
function shiftCalendarMonth(offset){
 month=moveMonth(month,offset);
 render();
}
// Reconcile the durable local desired state to Google every few seconds.
// Sending a batch does not block the UI's calendar tap handler.
async function flushPendingPresets(){
 if(presetFlushPromise)return presetFlushPromise;
 if(!presetQueue.size)return;
 if(busy||!api.connected||navigator.onLine===false){showStatus();return;}
 const entries=presetQueue.list(),keys=entries.map(e=>e.key);
 presetQueue.markInflight(keys);
 presetFlushing=true;showStatus();
 presetFlushPromise=(async()=>{
  let changed=false,failed=0,errorMessage='';
  try{
   const groups=new Map();
   for(const entry of entries){
    const groupKey=JSON.stringify([entry.rule.calendarId,entry.date.slice(0,7)]);
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    groups.get(groupKey).push(entry);
   }
   const operations=[],counts=new Map();
   for(const group of groups.values()){
    const first=group[0],calendarId=first.rule.calendarId;
    const [year,monthNo]=first.date.slice(0,7).split('-').map(Number);
    const from=first.date.slice(0,7)+'-01';
    const to=monthNo===12?`${year+1}-01-01`:`${year}-${String(monthNo+1).padStart(2,'0')}-01`;
    const remote=await api.events(calendarId,from,to);
    const bucket=dataFor(calendarId);
    for(const entry of group){
     // A later tap can supersede the queued operation during the GET.
     if(presetQueue.get(entry.key)?.version!==entry.version)continue;
     const match=e=>!!matchingPresetEvent([e],calendarId,entry.date,entry.rule);
     const existing=remote.filter(match);
     bucket.events=bucket.events.filter(e=>!match(e)).concat(existing);
     const requested=entry.present&&!existing.length?[{type:'insert',calendarId,date:entry.date,rule:entry.rule,id:entry.id}]:
      !entry.present?existing.map(event=>({type:'delete',calendarId,event})):[];
     if(!requested.length){presetQueue.ack(entry.key,entry.version);changed=true;continue;}
     counts.set(entry.key,{version:entry.version,total:requested.length,ok:0});
     for(const op of requested)operations.push({...op,key:entry.key});
    }
   }
   for(let offset=0;offset<operations.length;offset+=50){
    const batch=operations.slice(offset,offset+50);
    const outcomes=await api.batchPresetChanges(batch);
    for(let i=0;i<batch.length;i++){
     const op=batch[i],out=outcomes[i],record=counts.get(op.key);
     if(!out?.ok){failed++;errorMessage=out?.error||'保存に失敗しました。';continue;}
     record.ok++;
     const bucket=dataFor(op.calendarId);
     if(op.type==='insert'){
      const created=out.event&&out.event.id?out.event:
       {...presetEventPayload(op.date,op.rule),id:op.id};
      bucket.events=bucket.events.filter(e=>e.id!==created.id).concat(created);
     }else bucket.events=bucket.events.filter(e=>e.id!==op.event.id);
     changed=true;
    }
   }
   for(const [key,record] of counts){
    if(record.ok===record.total)presetQueue.ack(key,record.version);
   }
   if(failed)notify(`${failed}件の予定を保存できませんでした。未同期のまま保持しています。${errorMessage}`);
   else if(changed)notify('Googleカレンダーに予定をまとめて保存しました。');
  }catch(error){
   notify('予定の一括保存に失敗しました。未同期の変更は保持しています：'+error.message);
  }finally{
   presetQueue.unmarkInflight(keys);
   presetFlushing=false;
   lastCalendarAttempt=0;
   render();
  }
 })();
 try{return await presetFlushPromise;}finally{presetFlushPromise=null;}
}
function togglePresetOnDate(date){
 const rule=state.iconRules.find(rule=>rule.id===selectedPresetId);
 if(!rule)return;
 const calendarId=String(rule.calendarId||''),title=String(rule.keyword||'').trim();
 if(!title)throw Error('プリセットのタイトルが未設定です。');
 if(!calendarId)throw Error('このプリセットの登録先カレンダーが未設定です。設定から指定してください。');
 if(calendars.length&&!calendars.some(c=>c.id===calendarId&&['owner','writer'].includes(c.accessRole)))
  throw Error('指定されたカレンダーを編集できません。Googleカレンダーの設定・アクセス権を確認してください。');
 presetQueue.toggle(rule,date,dataFor(calendarId).events);
 render();
}
async function selectCalendarDate(date){
 if(selectedPresetId){selected=date;togglePresetOnDate(date);return;}
 const next=dateTapAction(selected,date);
 if(next.open){
  // The selected day is already highlighted. One tap opens its details.
  modal('日付の詳細',dayContent(selected));
  return;
 }
 selected=next.selected;
 render();
 // The tapped button already handles focus; do not force an oversized focus ring.
}
const actions={
 'flush-presets':()=>flushPendingPresets(),
 'confirm-create-calendar':async b=>{
  if(calendarCreationBusy)return;
  const rule=presetEditDraft;
  if(!rule||rule.id!==b.dataset.ruleId)throw Error('編集中のプリセットがありません。');
  if(!api.connected)throw Error('Googleへログインしてからカレンダーを作成してください。');
  const input=calendarCreatePayload({
   summary:$('#new-calendar-name')?.value,
   description:$('#new-calendar-description')?.value,
   timeZone:$('#new-calendar-timezone')?.value
  });
  // Authorization must begin synchronously from the click for iOS popup support.
  const permission=api.authorizeCalendarCreation(GOOGLE_CLIENT_ID);
  calendarCreationBusy=true;b.disabled=true;
  try{
   const created=await api.createCalendar(input,await permission);
   if(!created?.id)throw Error('カレンダーが作成されましたが、IDを取得できませんでした。Googleカレンダーを確認してください。');
   const calendar={...created,summary:created.summary||input.summary,accessRole:'owner'};
   calendars=[...calendars.filter(c=>c.id!==calendar.id),calendar];
   // The new calendar exists remotely; the preset itself is still a draft.
   rule.calendarId=created.id;
   showPresetEditor();
   notify('「'+calendar.summary+'」を作成しました。プリセットは「決定」で保存してください。');
   void api.calendars().then(found=>{
    calendars=[...found.filter(c=>c.id!==calendar.id),found.find(c=>c.id===calendar.id)||calendar];
    if(tab==='settings')render();
   }).catch(()=>{});
  }finally{calendarCreationBusy=false;b.disabled=false;}
 },
 'notice-detail':()=>{const expired=expiredGoogleServices(api,drive);if(expired.calendar||expired.drive)return reauthenticateExpiredGoogle();if(currentNotice)modal('ステータス',`<p>${esc(currentNotice)}</p>`,button('閉じる','close-dialog'));},
 settings:()=>{tab='settings';render();prepareGoogleIdentity();},
 'open-month-picker':()=>openMonthPicker(),
 'choose-month':b=>chooseMonthFromPicker(Number(b.dataset.month)),
 'month-year-previous':()=>{const field=$('#month-picker-year');if(field)field.value=String(Math.max(1900,(Number(field.value)||month.getFullYear())-1));},
 'month-year-next':()=>{const field=$('#month-picker-year');if(field)field.value=String(Math.min(2100,(Number(field.value)||month.getFullYear())+1));},
 'prev-month':()=>shiftCalendarMonth(-1),'next-month':()=>shiftCalendarMonth(1),today:()=>{selected=today();month=new Date(`${selected.slice(0,7)}-01T12:00:00`);render();},
 date:b=>selectCalendarDate(b.dataset.date),
 'select-preset':b=>{selectedPresetId=selectedPresetId===b.dataset.ruleId?null:b.dataset.ruleId;renderPresetBar();},
 'new-record':b=>openRecord(null,{date:b.dataset.date||today()}),record:b=>openRecord(records().find(r=>r.id===b.dataset.id&&r.calendarId===(b.dataset.calendar||primaryCalendarId()))),
 'close-dialog':closeModal,'editor-add':()=>{editor.dishes.push({name:'',category:'main'});drawRecord();},'editor-remove':b=>{editor.dishes.splice(Number(b.dataset.index),1);drawRecord();},
 'suggest-record-dish':pickRecordDishSuggestion,'pick-location':pickPlaceSuggestion,
 'close-place-search':()=>closePlaceSearchSheet(),
 
 'save-record':saveRecord,
 'delete-record':()=>{modal('この実績を削除しますか？',`<p>${esc(editor.date)}：${esc(editor.dishes.map(d=>d.name).join('、'))}</p><p>Googleカレンダーからこの予定を直接削除します。この操作は取り消せません。</p>`,button('戻る','return-editor')+button('削除する','confirm-delete','danger'));},'return-editor':drawRecord,
 'confirm-delete':async()=>{if(editor.scope!==scopeKeyFor(editor.calendarId||primaryCalendarId()))throw Error('元のカレンダーに戻って操作してください。');busy=true;updateConnection();try{const id=editor.calendarId||primaryCalendarId();await api.remove(id,editor);dataFor(id).events=dataFor(id).events.filter(e=>e.id!==editor.id);closeModal();render();notify('実績を削除しました。');}finally{busy=false;updateConnection();}},
 connect:async()=>{
  if(!GOOGLE_CLIENT_ID)throw Error('このアプリのGoogleログイン設定が完了していません。開発者が初期設定を行う必要があります。');
  // The login button is enabled only after the Google library is ready.
  // This ensures the OAuth popup is initiated by this exact user tap.
  if(!authReady||!globalThis.google?.accounts?.oauth2){
   prepareGoogleIdentity();
   notify('Google認証を読み込んでいます。準備完了後にログインできます。');
   return;
  }
  if(expiredGoogleServices(api,drive).calendar)return reauthenticateExpiredGoogle();
  await api.authorize(GOOGLE_CLIENT_ID);
  currentNotice='';showStatus();
  if(!await loadCalendarOptions()){notify(calendarLoadError);return;}
  if(hasSyncedCalendars())await sync();
  else notify('Googleに接続しました。分類ごとのカレンダーを設定してください。');
 },
 'refresh-calendars':async()=>{
  if(!api.connected)throw Error('Googleへログインしてからカレンダー一覧を取得してください。');
  if(!await loadCalendarOptions()){notify(calendarLoadError);return;}
  if(hasSyncedCalendars())await sync();
  else notify(`${calendars.length}件のカレンダーを取得しました。分類ごとにカレンダーを設定してください。`);
 },
 disconnect:()=>{calendarAutoReady=false;api.disconnect();currentNotice='';calendars=[];calendarLoadError='';for(const bucket of Object.values(state.scopes)){bucket.events=[];bucket.lastSync=null;}render();notify('Googleとの接続を解除しました。端末の下書きは残しています。');},sync,
 theme:b=>{state.theme.color=b.dataset.color;persist();render();},
 rules:()=>modal('献立生成ルール',rulesFields(),button('完了','close-dialog','primary')),
 generate:async()=>{const requested=Number($('#days')?.value||state.rules.days);if(!Number.isInteger(requested)||requested<1||requested>31)throw Error('日数は1〜31日で指定してください。');if(state.draft.slice(requested).some(day=>day.dishes.some(d=>d.locked)))throw Error('減らす日数の範囲に固定した料理があります。固定を解除するか、生成日数を戻してください。');state.rules.days=requested;if(!Object.values(state.rules.counts).some(n=>n>0))throw Error('1日あたりの品数を1以上にしてください。');for(const day of state.draft)for(const d of day.dishes)d.name=resolveName(d.name,data().aliases);const result=$('#generate-mode')?.value==='ai'?{plan:await ai.generate({master:master(),rules:state.rules,previous:state.draft}),issues:[]}:generate(master(),state.rules,state.draft);state.draft=result.plan;issues=result.issues;persist();render();notify('献立案を作りました。カレンダーにはまだ登録していません。');},
 reroll:b=>{const i=Number(b.dataset.day),j=Number(b.dataset.dish);if(state.draft[i]?.dishes[j]?.locked)state.draft[i].dishes[j]={...state.draft[i].dishes[j],locked:false};const result=reroll(master(),state.rules,state.draft,i,j);state.draft[i].dishes[j]=result.dish;issues=result.issues;persist();render();},
 'edit-plan-dish':b=>editPlanDish(Number(b.dataset.day),Number(b.dataset.dish)),'add-plan-dish':b=>editPlanDish(Number(b.dataset.day)),
 'save-plan-dish':()=>{const {dayIndex,dishIndex}=editingPlan;const name=$('#plan-name').value.trim(),existing=master().find(d=>normalize(d.name)===normalize(name));const d=validateDishes([{...existing,name,category:$('#plan-category').value}])[0];d.locked=dishIndex!==null?state.draft[dayIndex].dishes[dishIndex].locked:false;if(dishIndex===null)state.draft[dayIndex].dishes.push(d);else state.draft[dayIndex].dishes[dishIndex]=d;closeModal();checkDraft();},
 'delete-plan-dish':()=>{state.draft[editingPlan.dayIndex].dishes.splice(editingPlan.dishIndex,1);closeModal();checkDraft();},
 'day-up':b=>{const i=Number(b.dataset.day);[state.draft[i-1],state.draft[i]]=[state.draft[i],state.draft[i-1]];persist();render();},'day-down':b=>{const i=Number(b.dataset.day);[state.draft[i+1],state.draft[i]]=[state.draft[i],state.draft[i+1]];persist();render();},
 'record-day':b=>openRecord(null,{dishes:state.draft[b.dataset.day].dishes,date:today()}),master:masterModal,'edit-master':b=>editMaster(b.dataset.key),'add-master':()=>editMaster(),'save-master':saveMaster,
 'add-category':()=>modal('分類を追加','<label class="field"><span>分類名</span><input id="category-new" placeholder="ごはん・麺など" maxlength="20"></label>',button('追加','confirm-category','primary')),
 'confirm-category':()=>{const name=$('#category-new').value.trim();if(!name)throw Error('分類名を入力してください。');if(state.categories.some(c=>c.name===name))throw Error('同じ名前の分類があります。');const id='c'+uid().slice(0,10);state.categories.push({id,name});state.rules.counts[id]=0;persist();closeModal();render();},
 'remove-category':b=>{const id=b.dataset.category;if(id==='main')throw Error('主菜は削除できません。');if(editor?.dishes?.some(d=>d.category===id))throw Error('この分類を使っている入力途中の実績があります。先に保存または破棄してください。');state.categories=state.categories.filter(c=>c.id!==id);state.draft=state.draft.map(day=>({...day,dishes:day.dishes.filter(d=>d.category!==id)}));delete state.rules.counts[id];delete state.categoryCalendars[id];persist();render();notify('分類を削除しました。Googleカレンダーの予定は削除していません。');},
 'pick-photo':()=>$('#photo-file').click(),
 'analyze-photo':async()=>{const dishes=await ai.analyzePhoto(photoFile);openRecord(null,{dishes});notify('写真の推定結果です。料理名と分類を確認してから登録してください。');},
 'drive-sync-now':async()=>{
  if(!drive.autoEnabled)throw Error('この端末のDrive自動同期を有効にしてください。');
  if(!drive.connected)return reauthenticateExpiredGoogle();
  await autoDriveSync();
 },
 'drive-reconnect':async()=>{
  const expired=expiredGoogleServices(api,drive);
  if(expired.calendar||expired.drive)return reauthenticateExpiredGoogle();
  prepareDriveAuthorization();
  await drive.authorize(GOOGLE_CLIENT_ID);
  showStatus();
  await autoDriveSync();
 },
 'drive-save':async()=>{
  prepareDriveAuthorization();
  await drive.authorize(GOOGLE_CLIENT_ID);
  const remote=await drive.find();
  if(remote){
   modal('Driveのバックアップを上書きしますか？',
    `<p>すでにGoogleドライブへ設定が保存されています。現在の端末の設定で置き換えます。</p><p>Driveの更新日時：${esc(driveBackupTime(remote.modifiedTime))}</p><p class="hint">他の端末で復元したい設定が保存されている場合は、先に「Driveから復元」を行ってください。</p>`,
    button('キャンセル','close-dialog')+button('上書きして保存','confirm-drive-save','primary'));
   return;
  }
  const uploadedSnapshot=createDriveSnapshot(state);
  const upload=await drive.save(uploadedSnapshot);
  setDriveSyncStatus('手動バックアップ送信済み（表示カレンダー '+state.extraCalendarIds.length+'件）',true);
  if(drive.autoEnabled){const latest=upload?.version?upload:await drive.find();await markDriveSynced(String(latest?.version||''),uploadedSnapshot);driveAutoReady=true;}
  notify('設定をGoogleドライブにバックアップしました。別端末でも同期できます。');
 },
 'confirm-drive-save':async()=>{
  const uploadedSnapshot=createDriveSnapshot(state);
  const upload=await drive.save(uploadedSnapshot);
  setDriveSyncStatus('手動バックアップ送信済み（表示カレンダー '+state.extraCalendarIds.length+'件）',true);
  if(drive.autoEnabled){const latest=upload?.version?upload:await drive.find();await markDriveSynced(String(latest?.version||''),uploadedSnapshot);driveAutoReady=true;}
  closeModal();
  notify('Googleドライブの設定を更新しました。');
 },
 'drive-load':async()=>{
  prepareDriveAuthorization();
  await drive.authorize(GOOGLE_CLIENT_ID);
  driveImportedRaw=await drive.load();
  driveImported=readDriveSnapshot(driveImportedRaw,state,validateImport);
  modal('Googleドライブの設定を復元',
   driveBackupSummary(driveImported)+
   '<p>この端末の分類、カレンダー割り当て、生成ルール、配色などをバックアップの内容に置き換えます。新形式のバックアップでは料理マスターの手動登録・生成の下書きも復元します。</p>'+
   '<p class="hint">Googleカレンダー上の調理実績は変更しません。Googleログインも解除しません。復元後に現在のアカウントのカレンダーを再取得します。</p>',
   button('キャンセル','close-dialog')+button('設定を復元','confirm-drive-load','primary'));
 },
 'confirm-drive-load':async()=>{
  if(!driveImported)throw Error('復元する設定がありません。');
  restoreDriveSnapshot(state,driveImported);state.iconRules=normalizePresetRules(state.iconRules);
  state.categoryCalendars=migrateCategoryCalendars(state.categories,state.categoryCalendars,state.calendarId);
  state.calendarId='';state.calendarName='';
  driveImported=null;
  const restoredSnapshot=driveImportedRaw;driveImportedRaw=null;
  const wasBooting=driveAutoBooting;driveAutoBooting=true;
  try{persist();}finally{driveAutoBooting=wasBooting;}
  if(drive.autoEnabled){const latest=await drive.find();await markDriveSynced(String(latest?.version||''),restoredSnapshot);driveAutoReady=true;}
  setDriveSyncStatus('手動バックアップ受信済み（表示カレンダー '+state.extraCalendarIds.length+'件）',true);
  closeModal();render();
  if(api.connected&&hasSyncedCalendars()){
   try{
    await sync();
    notify('Driveの設定を復元し、Googleカレンダーを同期しました。');
   }catch(error){notify('Driveの設定は復元しました。カレンダーの同期に失敗しました：'+error.message);}
  }else notify('Driveの設定を復元しました。Googleカレンダーへ接続すると履歴を取得できます。');
 },
  'add-icon-rule':()=>openPresetEditor(),
  'edit-icon-rule':b=>openPresetEditor(b.dataset.ruleId),
  'save-preset-editor':async()=>{
   capturePresetEditorFields();
   const rule=commitPresetEdit(presetEditDraft);
   const index=state.iconRules.findIndex(r=>r.id===presetEditOriginalId);
   const oldCalendarId=index>=0?state.iconRules[index].calendarId:'';
   if(index>=0)state.iconRules[index]=rule;
   else state.iconRules.push(rule);
   persist();
   closeModal();render();
   notify(index>=0?'プリセットを更新しました。':'プリセットを追加しました。');
   if(api.connected&&rule.calendarId!==oldCalendarId&&hasSyncedCalendars())await sync();
  },
  'return-preset-editor':()=>showPresetEditor(),
  'open-icon-picker':()=>{
   if(!presetEditDraft)return;
   capturePresetEditorFields();
   const rule=presetEditDraft;
   const palette=ICON_CHOICES.map((icon,index)=>`<button type="button" class="icon-tile ${normalizeIcon(rule.icon)===icon?'selected':''}" data-action="choose-icon" data-icon="${icon}" aria-pressed="${normalizeIcon(rule.icon)===icon}" aria-label="アイコン ${index+1}">${iconMarkup(icon,rule.color)}</button>`).join('');
   modal('アイコンを選択',`<div class="icon-tile-grid" role="group" aria-label="SVGアイコンの選択">${palette}</div>`,button('戻る','return-preset-editor'));
  },
  'choose-icon':b=>{
   if(!presetEditDraft||!ICON_CHOICES.includes(b.dataset.icon))return;
   presetEditDraft.icon=b.dataset.icon;
   showPresetEditor();
  },
  'remove-icon-rule':b=>{
   state.iconRules=state.iconRules.filter(rule=>rule.id!==b.dataset.ruleId);
   if(selectedPresetId===b.dataset.ruleId)selectedPresetId=null;
   persist();render();
  },
  export:exportState,import:()=>$('#import-file').click(),
 'confirm-import':()=>{selectedPresetId=null;const {clientId:ignoredImportedClientId,...restored}=imported;Object.assign(state,storedState(restored));state.iconRules=normalizePresetRules(state.iconRules);state.categoryCalendars=migrateCategoryCalendars(state.categories,state.categoryCalendars,state.calendarId);state.calendarId='';state.calendarName='';imported=null;api.disconnect();calendars=[];persist();closeModal();render();notify('設定と下書きを読み込みました。Googleに再接続してください。');}
};
async function run(action,b){try{if(busy&&!['close-dialog'].includes(action))return;await actions[action]?.(b);}catch(error){if($('#dialog').open&&$('#dialog-error'))$('#dialog-error').textContent=error.message;else notify(error.message);updateConnection();}}

const PRESET_DRAG_HOLD_MS=320;
let presetDrag=null,suppressPresetClickUntil=0;
function finishPresetDrag(save=true){
 const drag=presetDrag;
 if(!drag)return;
 presetDrag=null;
 clearTimeout(drag.timer);clearInterval(drag.autoscroll);
 drag.ghost?.remove();
 drag.row.classList.remove('drag-placeholder');
 if(!drag.active)return;
 suppressPresetClickUntil=Date.now()+450;
 const ids=[...drag.list.querySelectorAll('.icon-preset-row[data-preset-id]')].map(el=>el.dataset.presetId);
 if(save){
  try{
   const ordered=reorderPresetRules(state.iconRules,ids);
   if(ordered.some((r,i)=>r.id!==state.iconRules[i].id)){
    state.iconRules=ordered;
    persist();
   }
  }catch(error){notify(error.message);}
 }
 if(tab==='settings')render();
}
function dragPresetToPoint(x,y){
 const drag=presetDrag;
 if(!drag)return;
 drag.lastX=x;drag.lastY=y;
 if(!drag.active){
  if(Math.hypot(x-drag.startX,y-drag.startY)>10)finishPresetDrag(false);
  return;
 }
 drag.ghost.style.transform=`translate3d(0,${y-drag.startY}px,0)`;
 const over=document.elementFromPoint(x,y)?.closest('.icon-preset-row[data-preset-id]');
 if(over&&over!==drag.row&&over.parentElement===drag.list){
  const rect=over.getBoundingClientRect();
  if(y<rect.top+rect.height/2)over.before(drag.row);
  else over.after(drag.row);
 }
}
function activatePresetDrag(){
 const drag=presetDrag;
 if(!drag||!drag.row.isConnected||tab!=='settings'||$('#dialog').open)return;
 drag.active=true;
 const box=drag.row.getBoundingClientRect(),ghost=drag.row.cloneNode(true);
 ghost.classList.add('preset-drag-ghost');
 ghost.removeAttribute('role');ghost.removeAttribute('data-preset-id');
 ghost.setAttribute('aria-hidden','true');
 ghost.style.left=box.left+'px';ghost.style.top=box.top+'px';
 ghost.style.width=box.width+'px';ghost.style.height=box.height+'px';
 ghost.querySelectorAll('button').forEach(b=>{b.tabIndex=-1;});
 document.body.appendChild(ghost);
 drag.ghost=ghost;
 drag.row.classList.add('drag-placeholder');
 window.getSelection()?.removeAllRanges();
 drag.autoscroll=setInterval(()=>{
  if(presetDrag!==drag||!drag.active)return;
  const viewport=drag.list.closest('.settings-grid');
  if(!viewport)return;
  const rect=viewport.getBoundingClientRect(),y=drag.lastY;
  const velocity=y<rect.top+38?-14:y>rect.bottom-38?14:0;
  if(velocity){viewport.scrollTop+=velocity;dragPresetToPoint(drag.lastX,drag.lastY);}
 },45);
 dragPresetToPoint(drag.lastX,drag.lastY);
}
function beginPresetDrag(target,x,y,kind,touchId=null){
 if(tab!=='settings'||$('#dialog').open)return;
 const row=target.closest?.('.icon-preset-row[data-preset-id]');
 if(!row||target.closest?.('button:not(.preset-drag-handle),input,select,textarea,a'))return;
 finishPresetDrag(false);
 presetDrag={row,list:row.parentElement,kind,touchId,startX:x,startY:y,lastX:x,lastY:y,active:false,ghost:null,timer:null,autoscroll:null};
 presetDrag.timer=setTimeout(activatePresetDrag,PRESET_DRAG_HOLD_MS);
}
function movePresetByKeyboard(handle,direction){
 const original=state.iconRules,updated=movePresetRule(original,handle.dataset.reorderHandle,direction);
 if(updated===original)return;
 state.iconRules=updated;
 persist();render();
 document.querySelector(`[data-reorder-handle="${handle.dataset.reorderHandle}"]`)?.focus({preventScroll:true});
}

// Capture pointer selection before iOS dismisses the keyboard and changes focus.
// The regular click action remains a fallback for keyboard and assistive tech.
document.addEventListener('pointerdown',e=>{
 if(e.pointerType!=='touch'&&e.button===0)beginPresetDrag(e.target,e.clientX,e.clientY,'pointer');
 // Select location options on click rather than pointerdown, allowing touch scrolling.
 if(e.target.id==='record-location'&&e.pointerType==='touch'&&matchMedia('(max-width:760px)').matches){
  e.preventDefault();openPlaceSearchSheet();return;
 }
 const candidate=e.target.closest?.('[data-action="suggest-record-dish"]');
 if(!candidate)return;
 e.preventDefault();
 pickRecordDishSuggestion(candidate);
},true);
document.addEventListener('pointermove',e=>{
 if(presetDrag?.kind==='pointer')dragPresetToPoint(e.clientX,e.clientY);
});
document.addEventListener('pointerup',()=>{if(presetDrag?.kind==='pointer')finishPresetDrag();});
document.addEventListener('pointercancel',()=>{if(presetDrag?.kind==='pointer')finishPresetDrag(false);});
document.addEventListener('touchstart',e=>{
 if(e.touches.length!==1)return;
 const touch=e.touches[0];
 beginPresetDrag(e.target,touch.clientX,touch.clientY,'touch',touch.identifier);
},{passive:true});
document.addEventListener('touchmove',e=>{
 const drag=presetDrag;
 if(!drag||drag.kind!=='touch')return;
 const touch=[...e.touches].find(t=>t.identifier===drag.touchId);
 if(!touch)return;
 dragPresetToPoint(touch.clientX,touch.clientY);
 if(presetDrag?.active&&e.cancelable)e.preventDefault();
},{passive:false});
document.addEventListener('touchend',e=>{
 if(presetDrag?.kind==='touch'&&[...e.changedTouches].some(t=>t.identifier===presetDrag.touchId))finishPresetDrag();
},{passive:true});
document.addEventListener('touchcancel',()=>{if(presetDrag?.kind==='touch')finishPresetDrag(false);},{passive:true});
document.addEventListener('contextmenu',e=>{
 if(e.target.closest?.('.icon-preset-row')&&presetDrag?.active)e.preventDefault();
});
document.addEventListener('keydown',e=>{
 const handle=e.target.closest?.('[data-reorder-handle]');
 if(!handle||!['ArrowUp','ArrowDown'].includes(e.key))return;
 e.preventDefault();
 movePresetByKeyboard(handle,e.key==='ArrowUp'?-1:1);
});
document.addEventListener('click',e=>{
 if(e.target.id==='record-location'&&matchMedia('(max-width:760px)').matches){
  openPlaceSearchSheet();return;
 }
 if(Date.now()<suppressPresetClickUntil&&e.target.closest?.('.icon-preset-row')){e.preventDefault();return;}
 const tabButton=e.target.closest('[data-tab]');
 if(tabButton){tab=tabButton.dataset.tab;notify('');render();if(tab==='settings')prepareGoogleIdentity();return;}
 const b=e.target.closest('[data-action]');
 if(!b)return;
 // iOS may synthesize a click after touchend even when the grid was swiped.
 if(b.dataset.action==='date'&&Date.now()<ignoreDateClickUntil){e.preventDefault();return;}
 run(b.dataset.action,b);
});
// Swipe only inside the visible month grid, never on navigation buttons,
// dialogs or page tabs. Vertical gestures remain available to the browser.
document.addEventListener('touchstart',e=>{
 calendarTouchStart=null;
 if(tab!=='calendar'||$('#dialog').open||e.touches.length!==1)return;
 if(!e.target.closest?.('.month-grid'))return;
 const touch=e.touches[0];
 calendarTouchStart={x:touch.clientX,y:touch.clientY,time:Date.now()};
},{passive:true});
document.addEventListener('touchend',e=>{
 const start=calendarTouchStart;calendarTouchStart=null;
 if(!start||tab!=='calendar'||$('#dialog').open||!e.changedTouches.length)return;
 const touch=e.changedTouches[0];
 const offset=horizontalMonthSwipe(start,{x:touch.clientX,y:touch.clientY,time:Date.now()});
 if(!offset)return;
 if(e.cancelable)e.preventDefault();
 ignoreDateClickUntil=Date.now()+350;
 shiftCalendarMonth(offset);
},{passive:false});
document.addEventListener('touchcancel',()=>{calendarTouchStart=null;},{passive:true});
// The login action directly starts the OAuth popup from the first enabled tap.
$('#connection').addEventListener('click',()=>run(api.connected?'settings':'connect'));
$('#sync').addEventListener('click',()=>run('sync'));
$('#dialog').addEventListener('cancel',()=>{editor=null;presetEditDraft=null;presetEditOriginalId=null;});
document.addEventListener('input',e=>{const el=e.target;
 if(el.id==='preset-edit-color'){updatePresetEditorIconPreview();return;}
 if(editor&&el.matches('[data-editor-name]')){editor.dishes[el.dataset.editorName].name=el.value;showDishSuggestions(el);}
 if(editor&&(el.id==='record-location'||el.id==='place-search-active')){
  editor.location=el.value;
  const other=el.id==='record-location'?$('#place-search-active'):$('#record-location');
  if(other)other.value=el.value;
  queuePlaceLookup(el);
 }
 if(el.id==='master-search'){const pos=el.selectionStart;masterQuery=el.value;masterModal();$('#master-search').focus();$('#master-search').setSelectionRange(pos,pos);}
});
document.addEventListener('scroll',e=>{
 if($('#dialog').open&&e.target.closest?.('.dialog-body'))positionPlaceSuggestions();
},true);
window.addEventListener('resize',positionPlaceSuggestions);
globalThis.visualViewport?.addEventListener('resize',positionPlaceSuggestions);
globalThis.visualViewport?.addEventListener('scroll',positionPlaceSuggestions);
document.addEventListener('focusin',e=>{
 const field=e.target.closest?.('[data-editor-name]');
 if(field){
  for(const list of document.querySelectorAll('.dish-suggestions'))if(list!==field.closest('.dish-input-group')?.querySelector('.dish-suggestions'))list.hidden=true;
  showDishSuggestions(field);
 }else if(!e.target.closest?.('.dish-suggestions'))hideDishSuggestions();
 if(e.target.id==='record-location'){
  if(matchMedia('(max-width:760px)').matches){openPlaceSearchSheet();return;}
  if(placeCache.has(e.target.value.trim()))queuePlaceLookup(e.target);
 }
});
document.addEventListener('keydown',e=>{
 if(e.target.id==='record-location'||e.target.id==='place-search-active'){
  if(e.key==='Enter'){e.preventDefault();queuePlaceLookup(e.target,{immediate:true});}
  else if(e.key==='ArrowDown'){
   const first=document.querySelector('#place-suggestions .place-suggestion');
   if(first){e.preventDefault();first.focus();}
  }else if(e.key==='Escape'){cancelPlaceLookup();hidePlaceSuggestions();}
  return;
 }
 if(e.target.matches?.('.place-suggestion')){
  if(e.key==='Escape'){
   document.querySelector('#record-location')?.focus();hidePlaceSuggestions();
  }else if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   const options=Array.from(document.querySelectorAll('#place-suggestions .place-suggestion'));
   const next=options.indexOf(e.target)+(e.key==='ArrowDown'?1:-1);
   if(options[next]){e.preventDefault();options[next].focus();}
  }
  return;
 }
 if(e.target.matches?.('[data-editor-name]')){
  if(e.key==='ArrowDown'){
   const suggestion=e.target.closest('.dish-input-group')?.querySelector('.dish-suggestion');
   if(suggestion){e.preventDefault();suggestion.focus();}
  }else if(e.key==='Escape')hideDishSuggestions();
 }else if(e.target.matches?.('.dish-suggestion')){
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   const buttons=Array.from(e.target.closest('.dish-suggestions')?.querySelectorAll('.dish-suggestion')||[]);
   const next=buttons.indexOf(e.target)+(e.key==='ArrowDown'?1:-1);
   if(buttons[next]){e.preventDefault();buttons[next].focus();}
  }else if(e.key==='Escape'){
   const input=e.target.closest('.dish-input-group')?.querySelector('[data-editor-name]');
   input?.focus();hideDishSuggestions();
  }
 }
});
document.addEventListener('change',async e=>{const el=e.target;try{
 if(el.id==='drive-auto'){
  if(!el.checked){
   drive.disableAuto();driveAutoReady=false;driveSyncStatus='';
   drivePending=false;driveCloudRevision='';driveBaseDigest='';setDriveMeta(DRIVE_DIRTY,'');setDriveMeta(DRIVE_REVISION,'');setDriveMeta(DRIVE_DIGEST,'');
   if(driveAutoTimer){clearTimeout(driveAutoTimer);driveAutoTimer=null;}
   notify('この端末のDrive自動同期を停止しました。');render();return;
  }
  try{
   prepareDriveAuthorization();
   await drive.authorize(GOOGLE_CLIENT_ID);
   drive.enableAuto();
   driveSyncStatus='認証済み・初回照合中';
   driveAutoReady=false;driveCloudRevision='';driveBaseDigest='';drivePending=false;
   setDriveMeta(DRIVE_REVISION,'');setDriveMeta(DRIVE_DIRTY,'');setDriveMeta(DRIVE_DIGEST,'');
   await autoDriveSync();
   if(drive.autoEnabled&&drive.connected&&!driveCloudRevision)
    notify('Driveの自動同期を有効にしました。接続状況を確認してください。');
  }catch(error){el.checked=drive.autoEnabled;throw error;}
  render();return;
 }

 if(editor){if(el.id==='record-date')editor.date=el.value;if(el.id==='record-location')editor.location=el.value;if(el.matches('[data-editor-category]'))editor.dishes[el.dataset.editorCategory].category=el.value;if(el.matches('[data-editor-name]')){const found=master().find(d=>normalize(d.name)===normalize(el.value));if(found){Object.assign(editor.dishes[el.dataset.editorName],{...found});const category=el.closest('.dish-editor')?.querySelector('[data-editor-category]');if(category)category.value=found.category;}}}
 if(el.id==='keep-connected'){
  try{
   api.setKeepConnected(el.checked);
   notify(el.checked?(api.connected?'この端末で接続を保持します。期限内の次回起動では自動接続します。':'接続を保持する設定を有効にしました。Googleに一度ログインしてください。'):'保存済みのGoogle認証情報をこの端末から削除しました。');
  }catch(error){el.checked=api.keepConnected;throw error;}
  render();return;
 }
 if(el.dataset.categoryCalendar){state.categoryCalendars[el.dataset.categoryCalendar]=el.value;const c=calendars.find(c=>c.id===state.categoryCalendars.main);state.timeZone=c?.timeZone||state.timeZone;persist();render();if(api.connected&&hasSyncedCalendars())await sync();}
  if(el.dataset.extraCalendar){state.extraCalendarIds=el.checked?[...new Set([...state.extraCalendarIds,el.dataset.extraCalendar])]:state.extraCalendarIds.filter(id=>id!==el.dataset.extraCalendar);persist();render();if(api.connected)await sync();}
  if(el.matches('[data-preset-draft]')){
  capturePresetEditorFields();
  if(el.id==='preset-edit-color')updatePresetEditorIconPreview();
  if(el.id==='preset-edit-calendar'&&el.value===NEW_CALENDAR_VALUE){
   el.value=presetEditDraft?.calendarId||'';
   openCalendarCreation(presetEditDraft.id);
  }
  return;
 }
  if(el.id==='calendar-refresh-minutes'){state.calendarRefreshMinutes=normalizeCalendarRefreshMinutes(Number(el.value));el.value=String(state.calendarRefreshMinutes);}
 if(el.id==='history-from')state.from=el.value||'2000-01-01';
 if(el.id==='theme-mode'){state.theme.mode=el.value;applyTheme(state.theme);}
 if(el.id==='seed-enabled')state.seedEnabled=el.checked;
 if(el.id.startsWith('rule-')){const key=el.id.slice(5);state.rules[key]=el.type==='checkbox'?el.checked:Math.max(1,Math.min(365,Number(el.value)||1));el.value=state.rules[key];}
 if(el.id.startsWith('count-')){state.rules.counts[el.id.slice(6)]=Math.max(0,Math.min(5,Number(el.value)||0));el.value=state.rules.counts[el.id.slice(6)];}
 if(el.dataset.categoryName){const name=el.value.trim();if(!name||state.categories.some(c=>c.id!==el.dataset.categoryName&&c.name===name))throw Error('分類名は空欄や重複にできません。');state.categories.find(c=>c.id===el.dataset.categoryName).name=name;}
 if(el.id==='days'){state.rules.days=Math.max(1,Math.min(31,Math.trunc(Number(el.value)||7)));el.value=state.rules.days;}
 if(el.id==='photo-file'){const file=el.files[0];if(file){if(!file.type.startsWith('image/')||file.size>15*1024*1024)throw Error('15MB以下の画像を選択してください。');if(photoURL)URL.revokeObjectURL(photoURL);photoFile=file;photoURL=URL.createObjectURL(file);render();}}
 if(el.id==='import-file'){const file=el.files[0];if(file){if(file.size>10*1024*1024)throw Error('設定ファイルは10MB以下で読み込んでください。');const parsed=JSON.parse(await file.text());validateImport(parsed);imported=parsed.state;modal('設定と下書きを置き換えますか？','<p>この端末の設定・下書き・履歴キャッシュを、選択したファイルの内容に置き換えます。Googleカレンダーは変更しません。</p>',button('キャンセル','close-dialog')+button('読み込む','confirm-import','primary'));}}
 persist();updateConnection();
 if(el.id==='calendar-refresh-minutes')await autoRefreshCalendar();
 }catch(error){notify(error.message);}});
function validateImport(p){if(p.format!=='kondate-settings-v1'||!p.state||!Array.isArray(p.state.categories)||!Array.isArray(p.state.draft)||!p.state.rules||!p.state.scopes)throw Error('献立ノートの設定ファイルではありません。');if(!['timeZone','from'].every(k=>typeof p.state[k]==='string')||!/^\d{4}-\d{2}-\d{2}$/.test(p.state.from)||!['oldDays','recentDays'].every(k=>Number.isInteger(p.state.rules[k])&&p.state.rules[k]>=1&&p.state.rules[k]<=365)||!['preferOld','excludeRecent','unique','balance','newMain'].every(k=>typeof p.state.rules[k]==='boolean'))throw Error('設定値の形式が不正です。');if(JSON.stringify(p).includes('"__proto__"'))throw Error('設定ファイルが不正です。');if(!p.state.categories.every(c=>/^[a-z][a-z0-9-]*$/.test(c.id)&&typeof c.name==='string'&&c.name.length<=20)||!p.state.categories.some(c=>c.id==='main'))throw Error('分類の設定が不正です。');if(p.state.categoryCalendars&&(!Object.values(p.state.categoryCalendars).every(v=>typeof v==='string')||!Object.keys(p.state.categoryCalendars).every(k=>/^[a-z][a-z0-9-]*$/.test(k))))throw Error('分類別カレンダーの設定が不正です。');if(p.state.extraCalendarIds&&(!Array.isArray(p.state.extraCalendarIds)||!p.state.extraCalendarIds.every(x=>typeof x==='string')))throw Error('表示カレンダーの設定が不正です。');
 if(p.state.iconRules&&(!Array.isArray(p.state.iconRules)||!p.state.iconRules.every(r=>typeof r.id==='string'&&/^[0-9a-f]{10}$/.test(r.id)&&typeof r.keyword==='string'&&r.keyword.length<=80&&isSupportedIcon(r.icon)&&(r.color===undefined||/^#[0-9a-f]{6}$/i.test(r.color))&&(r.memo===undefined||(typeof r.memo==='string'&&r.memo.length<=2000))&&(r.calendarId===undefined||(typeof r.calendarId==='string'&&r.calendarId.length<=512)))))throw Error('アイコンルールが不正です。');
 if(p.state.calendarRefreshMinutes!==undefined&&!CALENDAR_REFRESH_MINUTES.includes(p.state.calendarRefreshMinutes))throw Error('カレンダーの自動更新間隔が不正です。');
 if(!Number.isInteger(p.state.rules.days)||p.state.rules.days<1||p.state.rules.days>31||!Object.values(p.state.rules.counts).every(n=>Number.isInteger(n)&&n>=0&&n<=5)||!colors[p.state.theme?.color]||!['light','dark','auto'].includes(p.state.theme?.mode))throw Error('生成ルールまたはテーマが不正です。');for(const day of p.state.draft)if(day.dishes.length)validateDishes(day.dishes);for(const s of Object.values(p.state.scopes))if(!Array.isArray(s.events)||!s.legacy||!s.aliases||!s.metadata||!Array.isArray(s.manual))throw Error('履歴データが不正です。');}
window.addEventListener('storage-failed',()=>notify('端末への保存に失敗しました。空き容量・ブラウザ設定を確認し、編集中の内容を書き出してください。'));
window.addEventListener('online',()=>{notify('接続が戻りました。');void flushPendingPresets();void autoRefreshCalendar();});
window.addEventListener('offline',()=>notify('オフラインです。献立の編集は続けられます。カレンダーへの保存は接続後に行ってください。'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyTheme(state.theme));
setInterval(updateConnection,30000);
// Migrate the old persistent Google-event cache away on first launch.
persist();
render();
// Restore the calendar list and selected calendar automatically after F5 without a popup.
if(restoredGoogleSession){
 loadCalendarOptions().then(ready=>{
  if(ready&&hasSyncedCalendars())return sync();
 }).catch(error=>notify(error.message));
}
// Preload OAuth before enabling login; avoid the former two-tap retry flow.
driveAutoBooting=false;
prepareGoogleIdentity();
if(restoredDriveSession)autoDriveSync();
window.addEventListener('focus',()=>{if(drive.autoEnabled)autoDriveSync();void flushPendingPresets();void autoRefreshCalendar();});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden){if(drive.autoEnabled)autoDriveSync();void flushPendingPresets();void autoRefreshCalendar();}
});
setInterval(()=>{if(!document.hidden&&drive.autoEnabled)autoDriveSync();void autoRefreshCalendar();},30000);
// The journal is persisted on each tap; mobile browsers may suspend background timers.
window.addEventListener('pagehide',()=>{void flushPendingPresets();});
setInterval(()=>{if(presetQueue.size)void flushPendingPresets();},PRESET_FLUSH_INTERVAL_MS);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
