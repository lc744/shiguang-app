// 绸缪 · 通用 UI 与页面渲染（今天/预告/日历/详情）
/* ---------------- 通用 UI ---------------- */
function toast(text){
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------------- Android 侧滑/返回键：由内向外逐层关闭 ---------------- */
function __handleBackGesture(){
  const chain = [
    ['imgPreview', closeImgPreview],
    ['postDetail', closePostDetail],
    ['planOverlay', closePlanOverlay],
    ['plansOverlay', closePlansOverlay],
    ['myCommentsOverlay', closeMyComments],
    ['cityPickOverlay', closeCityPick],
    ['mapPicker', closeMapPicker],
    ['addrPicker', closeAddrPicker],
    ['publishOverlay', closePublish],
    ['genderOverlay', closeInfoEditor],
    ['birthOverlay', closeInfoEditor],
    ['settingsOverlay', closeSettings],
    ['nickOverlay', closeNickEditor],
    ['monthPickerOverlay', closeMonthPicker],
    ['loginOverlay', closeLogin],
  ];
  for(const [id, fn] of chain){
    const el = document.getElementById(id);
    if(el && getComputedStyle(el).display !== 'none'){
      try{ fn(); }catch(e){}
      return true;
    }
  }
  const gp = document.getElementById('geniePanel');
  if(gp && gp.classList.contains('show')){ try{ closeGenie(); }catch(e){} return true; }
  const active = document.querySelector('.page.active');
  if(active && active.id !== 'page-home'){
    showPage('page-home', document.querySelector('.tab[data-target="page-home"]'));
    return true;
  }
  return false;
}

function showPage(id, btn){
  if(id !== 'page-create' && id !== 'page-detail') lastPage = id;
  // 离开表单页时停止进行中的录音并丢弃未保存状态
  if(id !== 'page-create' && typeof stopRecording === 'function'){
    stopRecording(true);
    recordedDataUrl = null;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.header-actions .icon-btn').forEach(b => b.classList.remove('active'));
  const target = btn ? btn : document.querySelector(`.tab[data-target="${id}"]`);
  if(target) target.classList.add('active');
  // 添加事件页/详情页/分享页/我的页隐藏右下角 FAB，其他页面显示
  const fab = document.getElementById('fabAdd');
  if(fab) fab.classList.toggle('hidden', id === 'page-create' || id === 'page-detail' || id === 'page-share' || id === 'page-profile');
  // 分享页需要登录：未登录时提示并弹出登录框（页面在弹层下方展示）
  if(id === 'page-share' && typeof currentUser !== 'undefined' && !currentUser && typeof openLogin === 'function'){
    toast('登录后即可浏览与发布分享');
    openLogin();
  }
  // 分享页/我的页不显示顶部公共区（hero 卡 + 今日待办/已完成统计）
  document.body.classList.toggle('no-hero', id === 'page-share' || id === 'page-profile');
  // 分享页分段行吸顶时须停在标题栏下方（否则被 sticky header 遮挡）
  if(id === 'page-share') fixSegSticky();
  // 进入分享页时触发加载（首次或切回时刷新）
  if(id === 'page-share' && typeof refreshShare === 'function') refreshShare();
  window.scrollTo(0,0);
}
function fixSegSticky(){
  const hd = document.querySelector('.header');
  if(!hd) return;
  const apply = () => document.documentElement.style.setProperty('--header-h', hd.offsetHeight + 'px');
  apply();
  // 状态栏高度(--safe-top)等异步注入会导致 header 高度变化 → 跟踪修正
  if(!fixSegSticky._ro){
    try{
      fixSegSticky._ro = new ResizeObserver(apply);
      fixSegSticky._ro.observe(hd);
    }catch(e){}
  }
  if(!fixSegSticky._iv){
    fixSegSticky._iv = setInterval(apply, 2000);
  }
}
window.addEventListener('resize', fixSegSticky);
function goBack(){ showPage(lastPage); }

function periodOf(hhmm){
  const h = parseInt(hhmm,10);
  if(h < 6) return '凌晨';
  if(h < 12) return '上午';
  if(h < 14) return '中午';
  if(h < 18) return '下午';
  return '晚上';
}
function dateLabel(dateStr){
  const t = todayStr();
  const tmr = todayStr(new Date(Date.now()+86400000));
  if(dateStr === t) return '今天';
  if(dateStr === tmr) return '明天';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth()+1}月${d.getDate()}日`;
}
// 表情标签：自定义表情渲染为图片，内置表情渲染为 emoji 字符
function emojiTag(value, size){
  if(isCustomEmoji(value)){
    const src = emojiSrc(value);
    return `<img src="${esc(src)}" alt="自定义表情" style="width:${size||20}px;height:${size||20}px;object-fit:contain;vertical-align:middle" />`;
  }
  return esc(emojiIcon(value));
}

/* ---------------- 渲染：今天页 ---------------- */
function renderMissedBanner(){
  const wrap = document.getElementById('missedBanner');
  if(!wrap) return;
  // 过滤掉用户今天已手动关闭过的错过提醒（持久化记忆）
  const hiddenIds = getHiddenMissedIds();
  const missed = scanMissed().filter(e => !hiddenIds.has(e.id));
  if(!missed.length || missedBannerHidden){
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="missed-banner">
      <div class="missed-head">
        <strong>⏰ 有 ${missed.length} 个提醒已错过</strong>
        <button class="missed-close" onclick="hideMissedBanner()" title="关闭">✕</button>
      </div>
      ${missed.slice(0,5).map(e => `
        <div class="missed-item" onclick="openDetail('${e.id}')">
          <span>${esc(e.time)}</span><b>${esc(e.name)}</b><small>${emojiTag(e.emoji,16)}</small>
        </div>`).join('')}
      ${missed.length > 5 ? `<div class="missed-more">还有 ${missed.length-5} 个已错过…</div>` : ''}
    </div>`;
}
function renderHome(){
  const t = todayStr();
  const d = new Date();
  const wd = ['日','一','二','三','四','五','六'][d.getDay()];
  document.getElementById('homeDate').textContent = `${d.getMonth()+1}月${d.getDate()}日 · 星期${wd}`;

  const todays = events.filter(e => occursOn(e, t)).sort((a,b)=>a.time.localeCompare(b.time));
  const todo = todays.filter(e => !isDoneOn(e, t)).length;
  const done = todays.filter(e => isDoneOn(e, t)).length;
  document.getElementById('statTodo').textContent = todo;
  document.getElementById('statDone').textContent = done;
  const totalEl = document.getElementById('totalEvents');
  if(totalEl) totalEl.textContent = events.length;

  renderMissedBanner();

  const list = document.getElementById('todayList');
  if(!todays.length){
    list.innerHTML = `<div class="empty">今天还没有事件<br>点击右下角 + 安排一件事，可任选未来日期</div>`;
    return;
  }
  list.innerHTML = todays.map(e => {
    const done = isDoneOn(e, t);
    return `
    <div class="event ${done?'done':''}" onclick="openDetail('${e.id}')">
      <div class="event-time"><span>${esc(e.time)}</span><small>${periodOf(e.time)}</small></div>
      <div class="event-body"><strong>${esc(e.name)}</strong><p>${esc(e.note)||'无备注'}</p>
        <div class="tags"><span class="tag">${emojiTag(e.emoji,20)}</span><span class="tag">${e.voice==='自定义录音'&&e.voiceData?'● 已录音':'♫ '+esc(e.voice)}</span>${repeatLabel(e)?`<span class="tag">↻ ${esc(repeatLabel(e))}</span>`:''}</div>
      </div>
      <button class="event-check" onclick="toggleDone(event,'${e.id}')">✓</button>
    </div>`;
  }).join('');
}

/* ---------------- 渲染：预告页 ---------------- */
function daysUntil(dateStr){
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - now) / 86400000);
}
function renderUpcoming(){
  const t = todayStr();
  const nowHHMM = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  // 计算每个事件的下一次发生；有贪睡覆盖时优先用贪睡时间
  const nowStamp = `${t}T${nowHHMM}`;
  const items = events.map(e => {
    let ds;
    if(e.snooze && e.snooze > nowStamp) ds = e.snooze.slice(0,10);
    else {
      ds = nextOccur(e, t);
      if(!ds) return null;
      // 今天已发生且时间已过（非重复）
      if(ds === t && e.time <= nowHHMM && !e.weekdays.length) return null;
      // 今天已完成
      if(ds === t && isDoneOn(e, t)) return null;
    }
    return {e, ds};
  }).filter(Boolean)
    .sort((a,b) => (a.ds+a.e.time).localeCompare(b.ds+b.e.time));
  const el = document.getElementById('upcomingList');
  if(!items.length){
    el.innerHTML = `<div class="empty">近期没有待提醒的事件<br>点击右下角 + 计划下一件事</div>`;
    return;
  }
  el.innerHTML = items.map(({e, ds}) => {
    const d = daysUntil(ds);
    const label = d === 0 ? '今天' : d === 1 ? '明天' : d === 2 ? '后天' : `${d} 天后`;
    return `
    <div class="event" onclick="openDetail('${e.id}')">
      <div class="event-time"><span>${esc(e.time)}</span><small>${esc(label)}</small></div>
      <div class="event-body"><strong>${esc(e.name)}</strong><p>${esc(e.note)||'无备注'}</p>
        <div class="tags"><span class="tag">${emojiTag(e.emoji,20)}</span><span class="tag">♫ ${esc(e.voice)}</span><span class="tag">${dateLabel(ds)}</span>${repeatLabel(e)?`<span class="tag">↻ ${esc(repeatLabel(e))}</span>`:''}</div>
      </div>
    </div>`;
  }).join('');
}

/* ---------------- 渲染：日历页 ---------------- */
function initCalendar(){
  const d = new Date();
  calYear = d.getFullYear(); calMonth = d.getMonth(); selDate = todayStr();
  renderCalendar();
}
function changeMonth(delta){
  if(delta === 0){ const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); }
  else { calMonth += delta; if(calMonth < 0){calMonth = 11;calYear--;} if(calMonth > 11){calMonth = 0;calYear++;} }
  renderCalendar();
}
function renderCalendar(){
  document.getElementById('monthTitle').textContent = `${calYear} 年 ${calMonth+1} 月`;
  const first = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  // 周一为一周起点
  let startCol = (first.getDay() + 6) % 7;
  const t = todayStr();
  let html = '';
  for(let i=0;i<startCol;i++) html += `<div class="day pad"></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const ds = `${calYear}-${pad(calMonth+1)}-${pad(day)}`;
    const dayEvents = events.filter(e => occursOn(e, ds));
    const n = dayEvents.length;
    const hasBirthday = dayEvents.some(e => e.isBirthday);
    const fest = festivalOf(ds) || computedFestival(ds);
    const legal = LEGAL_HOLIDAYS[ds];
    const cls = ['day'];
    if(ds === t) cls.push('today');
    if(n) cls.push('has-event');
    if(ds === selDate) cls.push('selected');
    if(fest) cls.push('has-festival');
    if(legal && legal.t === 'rest') cls.push('legal-rest');
    if(legal && legal.t === 'work') cls.push('legal-work');
    // 角标：法定休/班优先，其次事件数，今天显示"今"
    let mark = '';
    if(legal) mark = legal.t === 'rest' ? '休' : '班';
    else if(ds === t) mark = '今';
    else if(n) mark = String(n);
    // 副文本：节日名优先，否则农历
    const sub = fest || lunarDayLabel(solarToLunar(ds));
    html += `<button class="${cls.join(' ')}" onclick="pickDay('${ds}')"><span>${hasBirthday ? '🎂' : day}</span><small>${sub}</small><i class="day-mark">${mark}</i></button>`;
  }
  document.getElementById('daysGrid').innerHTML = html;
  renderAgenda();
}
function pickDay(ds){
  selDate = ds;
  renderCalendar();
  toast(`已切换到 ${dateLabel(ds)}`);
}

/* ---------------- 年月选择器 ---------------- */
let pickerYear = 2026;
function openMonthPicker(){
  pickerYear = calYear;
  renderMonthPicker();
  document.getElementById('monthPickerOverlay').style.display = 'flex';
}
function closeMonthPicker(){
  document.getElementById('monthPickerOverlay').style.display = 'none';
}
function shiftPickerYear(delta){
  pickerYear += delta;
  if(pickerYear < 1901) pickerYear = 1901;
  if(pickerYear > 2099) pickerYear = 2099;
  renderMonthPicker();
}
function pickMonth(m){
  calYear = pickerYear;
  calMonth = m;
  closeMonthPicker();
  renderCalendar();
  toast(`${calYear} 年 ${m+1} 月`);
}
function jumpToTodayMonth(){
  const d = new Date();
  calYear = d.getFullYear(); calMonth = d.getMonth();
  closeMonthPicker();
  renderCalendar();
  toast('已回到本月');
}
function renderMonthPicker(){
  document.getElementById('ypYearLabel').textContent = pickerYear;
  const now = new Date();
  const isThisYear = pickerYear === now.getFullYear();
  document.getElementById('ypMonths').innerHTML = Array.from({length:12}, (_, i) => {
    const isCur = isThisYear && i === now.getMonth();
    const isSel = pickerYear === calYear && i === calMonth;
    const cls = ['yp-month'];
    if(isCur) cls.push('yp-current');
    if(isSel) cls.push('yp-selected');
    return `<button type="button" class="${cls.join(' ')}" onclick="pickMonth(${i})">${i+1}<small>月</small></button>`;
  }).join('');
}
function renderAgenda(){
  const items = events.filter(e => occursOn(e, selDate)).sort((a,b)=>a.time.localeCompare(b.time));
  const lunarInfo = dayFullLabel(selDate);
  document.getElementById('agendaTitle').textContent = `${dateLabel(selDate)} · ${lunarInfo}`;
  document.getElementById('agendaCount').textContent = `${items.length} 个事件`;
  const el = document.getElementById('agendaList');
  el.innerHTML = items.length ? items.map(e => `
    <div class="agenda-item" onclick="openDetail('${e.id}')">
      <div><strong>${e.isBirthday ? '🎂 ' : ''}${isDoneOn(e, selDate)?'✓ ':''}${esc(e.name)}</strong><span>${esc(e.time)} · ${periodOf(e.time)}${repeatLabel(e)?' · ↻ '+esc(repeatLabel(e)):''}</span></div>
      <span>→</span>
    </div>`).join('')
    : `<div class="empty">这一天还没有事件<br>点击 + 新建一个吧</div>`;
}

/* ---------------- 详情页 ---------------- */
function findEvent(id){ return events.find(e => e.id === id); }

function openDetail(id){
  const e = findEvent(id);
  if(!e) return;
  currentDetailId = id;
  const t = todayStr();
  const due = new Date(`${e.date}T${e.time}:00`);
  let status = isDoneOn(e, t) ? '已完成' : (due < new Date() ? '已到点' : '待提醒');
  document.getElementById('detailName').textContent = e.name;
  document.getElementById('detailStatus').textContent = status;
  document.getElementById('detailTimeLine').textContent = `${dateLabel(e.date)} ${e.time} · ${periodOf(e.time)}${repeatLabel(e)?' · 重复：'+repeatLabel(e):''}`;
  const detailEmoji = document.getElementById('detailEmoji');
  if(isCustomEmoji(e.emoji)) detailEmoji.innerHTML = `<img src="${esc(emojiSrc(e.emoji))}" alt="自定义表情" style="width:36px;height:36px;object-fit:contain" />`;
  else detailEmoji.textContent = emojiIcon(e.emoji || '⏰');
  document.getElementById('detailVoice').textContent = e.voice === '自定义录音'
    ? (e.voiceData ? '自定义录音 · 已录制' : '自定义录音 · 未录制')
    : e.voice;
  document.getElementById('detailNote').textContent = e.note || '无备注';
  showPage('page-detail');
}

function toggleDone(ev, id){
  ev.stopPropagation();
  const e = findEvent(id);
  if(!e) return;
  const t = todayStr();
  const i = (e.doneOn||[]).indexOf(t);
  if(i >= 0) e.doneOn.splice(i, 1); else e.doneOn.push(t);
  persist(); renderAll();
  toast(i >= 0 ? '已恢复为待办' : '已标记完成');
}
function completeCurrentEvent(){
  const e = findEvent(currentDetailId);
  if(!e) return;
  const t = todayStr();
  if(occursOn(e, t) && !(e.doneOn||[]).includes(t)) e.doneOn.push(t);
  persist(); renderAll();
  toast('已标记完成'); goBack();
}
function snoozeCurrentEvent(){
  const e = findEvent(currentDetailId);
  if(!e) return;
  const d = new Date(Date.now() + 10*60000);
  e.snooze = `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  persist(); renderAll();
  toast(`已延后到 ${e.snooze.slice(11)} 再提醒`); goBack();
}
function deleteCurrentEvent(){
  const e = findEvent(currentDetailId);
  if(!e) return;
  if(!confirm(`确定删除「${e.name}」吗？`)) return;
  events = events.filter(x => x.id !== currentDetailId);
  // 同步清理录音大对象
  if(isRecRef(e.voiceData)) mediaDel(e.voiceData);
  persist(); renderAll();
  toast('已删除'); goBack();
}


