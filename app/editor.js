// 拾光 · 新建/编辑表单（chips、重复规则选择、自定义录音）
/* ---------------- 新建 / 编辑 ---------------- */
let selectedRepeat = 'none';      // none | daily | weekdays | custom
let selectedWeekdays = [];        // 自定义重复时选中的星期（1..7，1=周一）
let isBirthdayMode = false;       // 生日事件模式
let isLunarBirthday = false;      // 农历生日

/* ---------------- 生日开关 ---------------- */
function toggleBirthday(btn){
  isBirthdayMode = !isBirthdayMode;
  refreshBirthdayUI();
}
function toggleLunarBirthday(btn){
  isLunarBirthday = !isLunarBirthday;
  refreshBirthdayUI();
}
function refreshBirthdayUI(){
  const bChip = document.getElementById('birthdayChip');
  const lChip = document.getElementById('lunarBirthdayChip');
  if(bChip){
    bChip.textContent = isBirthdayMode ? '已开启' : '关闭';
    bChip.classList.toggle('selected', isBirthdayMode);
  }
  if(lChip){
    lChip.style.display = isBirthdayMode ? '' : 'none';
    lChip.textContent = isLunarBirthday ? '农历生日' : '公历生日';
    lChip.classList.toggle('selected', isLunarBirthday);
  }
}

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
  refreshRecButtons();
  document.querySelectorAll('#emojiChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.emoji === selectedEmoji));
  document.querySelectorAll('#voiceChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.voice === selectedVoice));
  syncRepeatUI(e);
  // 生日状态回填
  isBirthdayMode = !!(e && e.isBirthday);
  isLunarBirthday = !!(e && e.lunarBirthday);
  refreshBirthdayUI();
  document.getElementById('errName').style.display = 'none';
  document.getElementById('errTime').style.display = 'none';
  showPage('page-create');
}

async function saveEvent(){
  const name = document.getElementById('fName').value.trim();
  const note = document.getElementById('fNote').value.trim();
  const date = document.getElementById('fDate').value;
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

  // 验证时间
  const validTime = date && time;
  const isFuture = validTime && new Date(`${date}T${time}:00`) > new Date();
  if(!validTime || !isFuture) {
    errTimeEl.style.display = 'block';
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
      if(changedTime){ e.doneOn = []; e.firedOn = []; delete e.snooze; }
      // 录音被替换/清除时回收旧的大对象
      if(isRecRef(oldVoice) && oldVoice !== voiceData) mediaDel(oldVoice);
    }
    toast(isBirthdayMode ? '🎂 生日提醒已保存，每年当天送上祝福' : '修改已保存');
  } else {
    events.push({id:eventId, name, note, date, time, emoji:selectedEmoji, voice:selectedVoice, voiceData, weekdays,
      isBirthday:isBirthdayMode, lunarBirthday:isBirthdayMode ? isLunarBirthday : false, doneOn:[], firedOn:[]});
    toast(isBirthdayMode ? `🎂 生日提醒已保存：每年 ${date.slice(5).replace('-','月')}日 祝生日快乐` : `提醒已保存：${dateLabel(date)} ${time} 到点提醒你`);
  }
  persist(); renderAll();
  lastPage = 'page-home';
  showPage('page-home');
}


