/**
 * Compact day detail shared by the calendar sidebar and the date dialog.
 * One event occupies one line, even when it contains several dishes or notes.
 */
export function renderDayDetail({date,records=[],otherEvents=[],editingMemo=null,categoryName,iconMarkup,esc,button}){
 const day=new Date(`${date}T12:00:00`);
 const title=`${day.getMonth()+1}月${day.getDate()}日`;
 const weekday='日月火水木金土'[day.getDay()];
 const actualRows=records.map(record=>{
  const names=(record.dishes||[]).map(d=>`${categoryName(d.category)} ${d.name}`).join(' ／ ');
  const fallback=record.raw?.summary||'書式を確認してください';
  const name=names||fallback;
  const location=String(record.location||'').trim();
  const full=name+(location?' ／ 外食・場所：'+location:'');
  const invalid=record.status==='invalid';
  return `<div class="day-detail-row day-record-row">
   ${invalid?'<span class="day-record-warning" title="元のGoogleカレンダーの予定を確認してください" aria-label="書式を確認してください">⚠</span>':''}
   <span class="day-detail-text" title="${esc(full)}">
    <span class="day-record-names">${esc(name)}</span>${location?`<span class="day-record-location"> ／ 外食・場所：${esc(location)}</span>`:''}
   </span>
   ${invalid?'':button('編集','record','mini day-record-edit',`data-id="${esc(record.id)}" data-calendar="${esc(record.calendarId)}" aria-label="${esc(name)}を編集"`)}
  </div>`;
 }).join('');
 const noRecord=!records.length?`<div class="day-detail-empty">
  <span class="day-empty-icon" aria-hidden="true"></span>
  <span class="day-empty-message"><strong>この日の記録はありません</strong><small>何を作りましたか？料理名だけでも記録できます。</small></span>
 </div>`:'';
 // Input is already priority-ordered. A stable partition keeps each group's
 // priority unchanged while displaying memo-bearing events first.
 const ordered=[...otherEvents.filter(e=>String(e.memo||'').trim()),...otherEvents.filter(e=>!String(e.memo||'').trim())];
 const otherRows=ordered.map(event=>{
  const memo=String(event.memo||'').replace(/\s+/g,' ').trim();
  const full=event.title+(memo?' ／ '+memo:'');
  const editing=!!editingMemo&&editingMemo.id===event.id&&editingMemo.calendarId===event.calendarId&&editingMemo.date===event.date;
  const editButton=event.editable?button('メモ編集','edit-event-memo','mini day-event-edit',
   `data-id="${esc(event.id)}" data-calendar="${esc(event.calendarId)}" data-date="${esc(event.date)}" aria-label="${esc(event.title)}のメモを編集"`):'';
  return `<div class="day-other-entry">
   <div class="day-detail-row day-other-row">
    ${event.icon?`<span class="general-event-detail-icon" aria-hidden="true">${iconMarkup(event.icon,event.color)}</span>`:''}
    <span class="day-detail-text" title="${esc(full)}"><strong>${esc(event.title)}</strong>${memo?`<span class="day-event-memo"> ／ ${esc(memo)}</span>`:''}</span>
    ${editButton}
   </div>
   ${editing?`<div class="day-event-memo-editor">
    <label class="field"><span>メモ（空欄でも保存できます）</span><textarea data-event-memo-input rows="3" maxlength="2000" aria-label="${esc(event.title)}のメモ">${esc(editingMemo.value)}</textarea></label>
    <div class="day-event-memo-actions">
     ${button('キャンセル','cancel-event-memo','mini')}
     ${button('確定','save-event-memo','mini primary',`data-id="${esc(event.id)}" data-calendar="${esc(event.calendarId)}"`)}
    </div>
   </div>`:''}
  </div>`;
 }).join('');
 return `<div class="day-detail">
  <div class="day-detail-heading">
   <h2>${title} <small>（${weekday}）</small></h2>
   ${button('料理を登録','new-record','mini primary day-record-add',`data-date="${esc(date)}"`)}
  </div>
  <div class="day-detail-records">${actualRows||noRecord}</div>
  ${otherRows?`<div class="day-detail-other-events ${records.length?'has-actuals':''}">${otherRows}</div>`:''}
 </div>`;
}
