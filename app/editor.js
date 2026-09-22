// 绸缪 · 新建/编辑表单（chips、重复规则选择、自定义录音）
/* ---------------- 新建 / 编辑 ---------------- */
let selectedRepeat = 'none';      // none | daily | weekdays | custom
let selectedWeekdays = [];        // 自定义重复时选中的星期（1..7，1=周一）
let isBirthdayMode = false;       // 生日事件模式
let isLunarBirthday = false;      // 农历生日

/* ---------------- 通用滚轮选择弹层（日期/时间，滚轮 + 手动输入双模式） ---------------- */
let wpState = null;
const wpPad2 = n => String(n).padStart(2, '0');

function wpMakeCol(id, values, selected, onChange){
  fillWheel(id, values, selected, onChange);
  return { id, values, sel: Math.max(0, values.indexOf(selected)) };
}

function wpReadCol(c){
  const el = document.getElementById(c.id);
  return Math.max(0, Math.min(c.values.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)));
}

function openWheelPicker(cfg){
  wpState = cfg;
  document.getElementById('wpTitle').textContent = cfg.title;
  document.getElementById('wpManual').value = '';
  document.getElementById('wpManual').placeholder = cfg.manualPlaceholder || '或在此手动输入';
  document.getElementById('wpCols').innerHTML = cfg.cols.map(c => `<div class="wheel-col" id="${c.id}" style="flex:1"></div>`).join('');
  cfg.cols.forEach(c => wpMakeCol(c.id, c.values, c.selected, c.onChange));
  document.getElementById('wheelPickerOverlay').style.display = 'flex';
}

function closeWheelPicker(){
  const o = document.getElementById('wheelPickerOverlay'); if(o) o.style.display = 'none';
  wpState = null;
}

function wpConfirm(){
  if(!wpState) return;
  const manual = (document.getElementById('wpManual').value || '').trim();
  const out = wpState.onConfirm(manual, wpState.cols.map(c => c.values[wpReadCol(c)]));
  if(out === false) return;   // 手动值非法时保留弹层让用户改
  closeWheelPicker();
}

// 日期滚轮：年(1900..今年+10)/月/日，月年变化时日列联动天数（闰年/大小月）
function openDateWheel(){
  const cur = (document.getElementById('fDate').value || todayStr()).split('-');
  const y0 = parseInt(cur[0], 10) || new Date().getFullYear();
  const m0 = parseInt(cur[1], 10) || 1;
  const d0 = parseInt(cur[2], 10) || 1;
  const nowY = new Date().getFullYear();
  const years = Array.from({length: nowY + 10 - 1900 + 1}, (_, i) => 1900 + i);
  let sel = { y: y0, m: m0, d: Math.min(d0, new Date(y0, m0, 0).getDate()) };
  const dayValues = () => Array.from({length: new Date(sel.y, sel.m, 0).getDate()}, (_, i) => i + 1);
  openWheelPicker({
    title: '选择日期',
    manualPlaceholder: '或手动输入，如 2027-03-08',
    cols: [
      { id: 'wpY', values: years, selected: sel.y, onChange: v => { sel.y = v; sel.d = Math.min(sel.d, new Date(sel.y, sel.m, 0).getDate()); wpMakeCol('wpD', dayValues(), sel.d); } },
      { id: 'wpM', values: Array.from({length: 12}, (_, i) => i + 1), selected: sel.m, onChange: v => { sel.m = v; sel.d = Math.min(sel.d, new Date(sel.y, sel.m, 0).getDate()); wpMakeCol('wpD', dayValues(), sel.d); } },
      { id: 'wpD', values: dayValues(), selected: sel.d, onChange: v => { sel.d = v; } },
    ],
    onConfirm: (manual, vals) => {
      let v = vals[0] + '-' + wpPad2(vals[1]) + '-' + wpPad2(vals[2]);
      if(manual){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(manual)){ toast('日期格式应为 YYYY-MM-DD'); return false; }
        v = manual;
      }
      document.getElementById('fDate').value = v;
    }
  });
}

// 时间滚轮：时(0-23)/分(0-59)
function openTimeWheel(){
  const cur = (document.getElementById('fTime').value || '09:00').split(':');
  openWheelPicker({
    title: '选择时间',
    manualPlaceholder: '或手动输入，如 09:30',
    cols: [
      { id: 'wpH', values: Array.from({length: 24}, (_, i) => i), selected: parseInt(cur[0], 10) || 0, onChange: () => {} },
      { id: 'wpMin', values: Array.from({length: 60}, (_, i) => i), selected: parseInt(cur[1], 10) || 0, onChange: () => {} },
    ],
    onConfirm: (manual, vals) => {
      let v = wpPad2(vals[0]) + ':' + wpPad2(vals[1]);
      if(manual){
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(manual)){ toast('时间格式应为 HH:MM'); return false; }
        v = manual;
      }
      document.getElementById('fTime').value = v;
    }
  });
}

/* 生日提醒：不再手动开启——由“我的”页出生日期自动生成（isBirthday 事件）。
   编辑已存在的生日事件时保持其生日属性，不可转普通事件。 */

function buildChips(){
  document.getElementById('emojiChips').innerHTML = allEmojiValues().map(x =>
    `<button class="chip emoji-chip" data-emoji="${esc(x)}" onclick="pickEmoji(this)" title="选择表情">${isCustomEmoji(x) ? `<img src="${esc(emojiSrc(x))}" alt="自定义表情" style="width:24px;height:24px;object-fit:contain;vertical-align:middle" />` : esc(emojiIcon(x))}</button>`).join('');
  document.getElementById('voiceChips').innerHTML = VOICES.map(x =>
    `<button class="chip" data-voice="${esc(x)}" onclick="pickVoice(this)">♫ ${esc(x)}${VOICE_PHRASES[x] ? `<small style="display:block;font-size:10px;opacity:.75">${esc(VOICE_PHRASES[x][0])}</small>` : ''}</button>`).join('');
  document.getElementById('weekdayChips').innerHTML = [1,2,3,4,5,6,7].map(d =>
    `<button type="button" class="chip" data-wd="${d}" onclick="toggleWeekday(this)">周${WD_NAMES[d]}</button>`).join('');
}

function pickRepeat(btn){
  selectedRepeat = btn.dataset.repeat;
  document.querySelectorAll('#repeatChips .chip').forEach(c => c.classList.toggle('selected', c === btn));
  const wdBox = document.getElementById('weekdayChips');
  wdBox.style.display = selectedRepeat === 'custom' ? 'flex' : 'none';
  if(selectedRepeat === 'daily') selectedWeekdays = [1,2,3,4,5,6,7];
  if(selectedRepeat === 'weekdays') selectedWeekdays = [1,2,3,4,5];
  if(selectedRepeat === 'none') selectedWeekdays = [];
  syncWeekdayChips();
}
// 让星期 chips 的高亮状态与 selectedWeekdays 数据保持一致（自定义为多选）
function syncWeekdayChips(){
  document.querySelectorAll('#weekdayChips .chip').forEach(c =>
    c.classList.toggle('selected', selectedWeekdays.includes(parseInt(c.dataset.wd, 10))));
}
function toggleWeekday(btn){
  const d = parseInt(btn.dataset.wd, 10);
  const i = selectedWeekdays.indexOf(d);
  if(i >= 0) selectedWeekdays.splice(i, 1); else selectedWeekdays.push(d);
  btn.classList.toggle('selected', i < 0);
}

/* ---------------- 提醒方式开关（方案C'） ----------------
   登录用户（云端身份就绪）可三选：App本地提醒(默认) / 两端都提醒 / 仅微信服务通知；
   未登录固定 App 本地提醒（无选择界面）。与小程序端语义对齐（缺省=创建端本地提醒）。 */
let selectedRemindVia = 'app';
function currentRemindVia(){
  try{
    if(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser()){
      return selectedRemindVia;
    }
  }catch(e){}
  return 'app';
}
function pickRemindVia(btn){
  selectedRemindVia = btn.dataset.via || 'app';
  document.querySelectorAll('#remindViaChips .chip').forEach(c => c.classList.toggle('selected', c === btn));
}
function initRemindViaChips(editing){
  const box = document.getElementById('remindViaChips');
  const note = document.getElementById('remindViaNote');
  let loggedIn = false, saved = 'app';
  try{
    loggedIn = !!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser());
  }catch(e){}
  if(editing && editing.remindVia) saved = editing.remindVia;
  selectedRemindVia = loggedIn ? saved : 'app';
  if(!box) return;
  if(loggedIn){
    box.style.display = 'flex';
    if(note) note.style.display = 'none';
    box.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.via === selectedRemindVia));
  } else {
    box.style.display = 'none';
    if(note) note.style.display = 'block';
  }
}
function syncRepeatUI(e){
  // 从事件数据回显重复规则选择
  const wd = e && Array.isArray(e.weekdays) ? e.weekdays : [];
  if(!wd.length){ pickRepeat(document.querySelector('#repeatChips .chip[data-repeat="none"]')); return; }
  if(wd.length === 7){ pickRepeat(document.querySelector('#repeatChips .chip[data-repeat="daily"]')); }
  else if(wd.length === 5 && [1,2,3,4,5].every(d => wd.includes(d))){ pickRepeat(document.querySelector('#repeatChips .chip[data-repeat="weekdays"]')); }
  else {
    pickRepeat(document.querySelector('#repeatChips .chip[data-repeat="custom"]'));
    selectedWeekdays = wd.slice();
    document.querySelectorAll('#weekdayChips .chip').forEach(c =>
      c.classList.toggle('selected', selectedWeekdays.includes(parseInt(c.dataset.wd, 10))));
  }
}
function pickEmoji(btn){
  selectedEmoji = btn.dataset.emoji;
  document.querySelectorAll('#emojiChips .chip').forEach(c => c.classList.toggle('selected', c === btn));
}
function pickVoice(btn){
  selectedVoice = btn.dataset.voice;
  document.querySelectorAll('#voiceChips .chip').forEach(c => c.classList.toggle('selected', c === btn));
  updateRecorderUI();
}

/* ---------------- 自定义录音 ---------------- */
let mediaRecorder = null, recChunks = [], recTimer = null, recSeconds = 0;
let recordedDataUrl = null;   // 当前表单中已录好的音频（base64 DataURL）

function updateRecorderUI(){
  const box = document.getElementById('recorderBox');
  const isCustom = selectedVoice === '自定义录音';
  box.classList.toggle('show', isCustom);
  if(isCustom){
    // 回显：编辑带录音的事件时直接用其录音（openEditor 已预载，这里兜底内联旧数据）
    if(recordingState.active) return;
    const e = editingId ? findEvent(editingId) : null;
    if(recordedDataUrl === null && e && isDataUrl(e.voiceData)){
      recordedDataUrl = e.voiceData;
      document.getElementById('recAudio').src = recordedDataUrl;
    }
    refreshRecButtons();
  }else{
    stopRecording(true);
  }
}
function refreshRecButtons(){
  const has = !!recordedDataUrl;
  document.getElementById('recPlayBtn').style.display = has ? '' : 'none';
  document.getElementById('recRedoBtn').style.display = has ? '' : 'none';
  document.getElementById('recBtn').textContent = recordingState.active ? '■ 停止录音' : (has ? '● 重新录音' : '● 开始录音');
}
const recordingState = { active:false };

async function toggleRecord(){
  if(recordingState.active){ stopRecording(); return; }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    mediaRecorder = new MediaRecorder(stream);
    recChunks = [];
    mediaRecorder.ondataavailable = ev => { if(ev.data.size) recChunks.push(ev.data); };
    mediaRecorder.onstop = finishRecording;
    mediaRecorder.start();
    recordingState.active = true;
    recSeconds = 0;
    document.getElementById('recTime').textContent = '00:00';
    document.getElementById('recTime').classList.add('recording');
    recTimer = setInterval(() => {
      recSeconds++;
      document.getElementById('recTime').textContent = `${pad(Math.floor(recSeconds/60))}:${pad(recSeconds%60)}`;
      if(recSeconds >= 30){
        stopRecording();
        toast('已达 30 秒上限，自动停止');
      }
    }, 1000);
    refreshRecButtons();
    document.getElementById('recTip').textContent = '正在录音…说完点停止';
  }catch(err){
    toast('无法访问麦克风，请检查浏览器权限');
  }
}
function stopRecording(silent){
  if(!recordingState.active) return;
  recordingState.active = false;
  clearInterval(recTimer);
  document.getElementById('recTime').classList.remove('recording');
  if(mediaRecorder && mediaRecorder.state !== 'inactive'){ try{ mediaRecorder.stop(); }catch(e){} }
  if(silent){ // 切走时不保存
    recChunks = [];
    document.getElementById('recTip').textContent = '录一段自己的声音作为提示音（最长 30 秒）';
    refreshRecButtons();
  }
}
function finishRecording(){
  // 释放麦克风
  if(mediaRecorder && mediaRecorder.stream){
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  if(!recChunks.length){ refreshRecButtons(); return; }
  const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  const reader = new FileReader();
  reader.onload = () => {
    recordedDataUrl = reader.result;
    document.getElementById('recAudio').src = recordedDataUrl;
    document.getElementById('recTip').textContent = '录音已就绪，到点提醒时播放你的声音';
    refreshRecButtons();
  };
  reader.readAsDataURL(blob);
}
function playRecording(){
  const audio = document.getElementById('recAudio');
  if(recordedDataUrl){ audio.currentTime = 0; audio.play().catch(()=>{}); }
}
function clearRecording(){
  recordedDataUrl = null;
  document.getElementById('recAudio').removeAttribute('src');
  document.getElementById('recTip').textContent = '录一段自己的声音作为提示音（最长 30 秒）';
  document.getElementById('recTime').textContent = '00:00';
  refreshRecButtons();
}

async function openEditor(id){
  editingId = id || null;
  const e = id ? findEvent(id) : null;
  document.getElementById('formTitle').textContent = e ? '编辑提醒' : '新建提醒';
  document.getElementById('saveBtn').textContent = e ? '保存修改' : '保存提醒';
  document.getElementById('fName').value = e ? e.name : '';
  document.getElementById('fNote').value = e ? (e.note||'') : '';
  const now = new Date();
  // 新建默认：今天、下一个整点；编辑：回填原值
  document.getElementById('fDate').value = e ? e.date : todayStr();
  document.getElementById('fDate').min = todayStr();  // 允许今天及以后任意日期
  document.getElementById('fTime').value = e ? e.time : `${pad((now.getHours()+1)%24)}:00`;
  selectedEmoji = e ? e.emoji : EMOJIS[0];
  selectedVoice = e ? e.voice : VOICES[0];
  // 录音状态：编辑时回填事件已有录音（引用型从 IDB 取回 dataURL），新建时清空
  recordedDataUrl = null;
  if(e && e.voice === '自定义录音' && e.voiceData){
    recordedDataUrl = await resolveVoiceData(e);
  }
  if(recordedDataUrl){ document.getElementById('recAudio').src = recordedDataUrl; }
  else { document.getElementById('recAudio').removeAttribute('src'); }
  document.getElementById('recTime').textContent = '00:00';
  document.getElementById('recTip').textContent = recordedDataUrl ? '已使用此事件的原录音' : '录一段自己的声音作为提示音（最长 30 秒）';
  initRemindViaChips(e);   // 提醒方式三选（登录解锁；编辑时回填已有选择）
  refreshRecButtons();
  document.querySelectorAll('#emojiChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.emoji === selectedEmoji));
  document.querySelectorAll('#voiceChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.voice === selectedVoice));
  syncRepeatUI(e);
  // 生日状态回填（无 UI 开关；仅保持已有生日事件的属性不被改掉）
  isBirthdayMode = !!(e && e.isBirthday);
  isLunarBirthday = !!(e && e.lunarBirthday);
  document.getElementById('errName').style.display = 'none';
  document.getElementById('errTime').style.display = 'none';
  showPage('page-create');
}

async function saveEvent(){
  const name = document.getElementById('fName').value.trim();
  const note = document.getElementById('fNote').value.trim();
  let date = document.getElementById('fDate').value;
  const time = document.getElementById('fTime').value;

  let ok = true;
  const errNameEl = document.getElementById('errName');
  const errTimeEl = document.getElementById('errTime');

  // 验证事件名称
  if(!name) {
    errNameEl.style.display = 'block';
    ok = false;
  } else {
    errNameEl.style.display = 'none';
  }

  // 验证时间：重复事件（每天/周一到周五/自定义）只看时分，日期过期自动平铺到下一个重复日
  const validTime = date && time;
  const isRepeatEv = !isBirthdayMode && selectedRepeat !== 'none';
  let isFuture = validTime && new Date(`${date}T${time}:00`) > new Date();
  let rolledDate = '';
  if(validTime && !isFuture && isRepeatEv){
    const wdSet = selectedWeekdays.length ? selectedWeekdays : [1,2,3,4,5,6,7];
    const d = new Date(`${date}T${time}:00`);
    for(let i = 0; i < 15; i++){
      const w = d.getDay() === 0 ? 7 : d.getDay();
      if(wdSet.includes(w) && d > new Date()) break;
      d.setDate(d.getDate() + 1);
    }
    rolledDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    date = rolledDate;
    document.getElementById('fDate').value = date;
    isFuture = true;
  }
  if(!validTime || (!isFuture && !isBirthdayMode)) {
    errTimeEl.style.display = 'block';
    toast(isBirthdayMode ? '请选择今年接下来的生日日期' : '请选择将来的日期和时间');
    ok = false;
  } else {
    errTimeEl.style.display = 'none';
  }

  // 自定义重复必须至少选一天
  if(selectedRepeat === 'custom' && !selectedWeekdays.length){
    toast('自定义重复请至少选择一个星期');
    ok = false;
  }

  // 如果没有通过验证，显示弹窗提醒
  if(!ok) {
    // 滚动到第一个错误位置
    if(errNameEl.style.display === 'block') {
      errNameEl.scrollIntoView({behavior: 'smooth', block: 'center'});
    } else if (errTimeEl.style.display === 'block') {
      errTimeEl.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
    return;
  }

  const weekdays = selectedRepeat === 'none' ? [] : selectedWeekdays.slice().sort((a,b)=>a-b);
  const eventId = editingId || uid();
  // 提示音数据：自定义录音存入 IndexedDB 只留引用；其他提示音清除
  let voiceData = null;
  if(selectedVoice === '自定义录音' && recordedDataUrl){
    if(isDataUrl(recordedDataUrl) && await mediaProbe()){
      const key = 'rec:' + eventId;
      await mediaPut(key, recordedDataUrl).catch(() => {});
      voiceData = key;
    } else {
      voiceData = recordedDataUrl;
    }
  }

  if(editingId){
    const e = findEvent(editingId);
    if(e){
      // 如果时间或重复规则被改，重置完成与触发状态
      const changedTime = e.date !== date || e.time !== time ||
        JSON.stringify(e.weekdays||[]) !== JSON.stringify(weekdays) ||
        e.isBirthday !== isBirthdayMode || e.lunarBirthday !== isLunarBirthday;
      const oldVoice = e.voiceData;
      Object.assign(e, {name, note, date, time, emoji:selectedEmoji, voice:selectedVoice, voiceData, weekdays,
        isBirthday:isBirthdayMode, lunarBirthday:isBirthdayMode ? isLunarBirthday : false});
      // 提醒方式开关（方案C'）+ 云同步冲突判定时间戳
      e.remindVia = currentRemindVia();
      e.updatedAt = Date.now();
      if(changedTime){ e.doneOn = []; e.firedOn = []; delete e.snooze; }
      // 录音被替换/清除时回收旧的大对象
      if(isRecRef(oldVoice) && oldVoice !== voiceData) mediaDel(oldVoice);
    }
    toast(isBirthdayMode ? '🎂 生日提醒已保存，每年当天送上祝福' : '修改已保存');
  } else {
    events.push({id:eventId, name, note, date, time, emoji:selectedEmoji, voice:selectedVoice, voiceData, weekdays,
      isBirthday:isBirthdayMode, lunarBirthday:isBirthdayMode ? isLunarBirthday : false, doneOn:[], firedOn:[],
      remindVia: currentRemindVia(), updatedAt: Date.now()});
    toast(isBirthdayMode ? `🎂 生日提醒已保存：每年 ${date.slice(5).replace('-','月')}日 祝生日快乐` : `提醒已保存：${dateLabel(date)} ${time} 到点提醒你`);
  }
  persist(); renderAll();
  lastPage = 'page-home';
  showPage('page-home');
}


