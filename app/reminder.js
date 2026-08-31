// 绸缪 · 到点提醒（轮询、全屏弹层、语音播报、铃声、贪睡、错过提醒）
/* ---------------- 到点提醒 ---------------- */
let chimeCtx = null;
// 弹窗自动超时配置（默认 60 秒自动关闭）
const REMIND_AUTO_DISMISS = 60 * 1000; // 毫秒
let dismissTimer = null;
function playChime(){
  try{
    chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = chimeCtx;
    // iOS/部分浏览器：上下文被挂起时先尝试恢复
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
    [880, 1108.7, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.001, ctx.currentTime + i*0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i*0.18 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.18 + 0.9);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i*0.18); o.stop(ctx.currentTime + i*0.18 + 1);
    });
  }catch(e){/* 音频不可用时静默 */}
}

function checkReminders(){
  // Android 原生引擎接管所有提醒触发；iOS 前台仍需 JS 轮询（系统通知前台静默，由 JS 弹层提醒）
  if(window.__NATIVE__ && !window.__IS_IOS__) return;
  const now = new Date();
  const t = todayStr();
  const nowHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const nowStamp = `${t}T${nowHHMM}`;
  const isDue = e => {
    // 贪睡覆盖：到达贪睡时间即触发（一次性）
    if(e.snooze){
      if(e.snooze <= nowStamp){ return !(e.firedOn||[]).includes('snooze:'+e.snooze); }
      return false;
    }
    // 正常触发：今天发生、未完成、未在今天触发过、时间已到
    if(!occursOn(e, t) || isDoneOn(e, t)) return false;
    if((e.firedOn||[]).includes(t)) return false;
    return e.time <= nowHHMM;
  };
  // 多个到点时优先弹设定时间最晚（等待最久、最紧迫）的那个
  const due = events.filter(isDue).sort((a,b) => b.time.localeCompare(a.time))[0];
  if(due) fireRemind(due);
}
async function fireRemind(e){
  const t = todayStr();
  if(e.snooze && e.snooze <= `${t}T${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`){
    (e.firedOn = e.firedOn || []).push('snooze:'+e.snooze);
    delete e.snooze;
  } else {
    (e.firedOn = e.firedOn || []).push(t);
  }
  persist();
  activeRemindId = e.id;
  // 清除旧的定时器
  if(dismissTimer) clearTimeout(dismissTimer);
  // 设置新的定时器：超时后自动关闭 + 停止语音
  dismissTimer = setTimeout(() => {
    dismissTimer = null;
    dismissRemind();
  }, REMIND_AUTO_DISMISS);
  const emojiEl = document.getElementById('rEmoji');
  if(isCustomEmoji(e.emoji)) emojiEl.innerHTML = `<img src="${esc(emojiSrc(e.emoji))}" alt="自定义表情" style="width:72px;height:72px;object-fit:contain" />`;
  else emojiEl.textContent = e.isBirthday ? '🎂' : emojiIcon(e.emoji || '⏰');
  document.getElementById('rName').textContent = e.isBirthday ? `🎂 ${e.name} 生日快乐！` : e.name;
  document.getElementById('rNote').textContent = e.isBirthday ? (e.note || '又长大一岁啦，愿新的一岁平安喜乐！') : (e.note || '');
  document.getElementById('rTime').textContent = e.time;
  document.getElementById('remindOverlay').classList.add('show');
  // 自定义录音优先；否则播报“常用语句 + 备注”，失败再回退合成提示音
  if(e.voice === '自定义录音' && e.voiceData){
    const vd = await resolveVoiceData(e);
    if(vd) playVoiceData(vd).catch(() => playChime());
    else playChime();
  } else {
    speakReminder(e).catch(() => playChime());
  }
}
function speakReminder(e){
  return new Promise((resolve, reject) => {
    if(!('speechSynthesis' in window)){ reject(new Error('TTS unavailable')); return; }
    // 生日事件播报生日祝福
    if(e.isBirthday){
      const utter = new SpeechSynthesisUtterance(`今天是你${e.name}的生日，祝你生日快乐，天天开心！`);
      utter.lang = 'zh-CN';
      utter.onend = resolve;
      utter.onerror = reject;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      return;
    }
    const phrase = e.voice && VOICE_PHRASES[e.voice] ? VOICE_PHRASES[e.voice][0] : '提醒你';
    const text = [phrase, e.note || e.name].filter(Boolean).join('，');
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    // 音色微调（仅对真实存在的音色生效）
    utter.pitch = e.voice === '温柔女声' ? 1.15 : e.voice === '活力男声' ? .95 : 1;
    utter.onend = resolve;
    utter.onerror = reject;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}
// 播放 base64 录音，返回 Promise（用户手势预热过的 AudioContext/播放链路）
function playVoiceData(dataUrl){
  return new Promise((resolve, reject) => {
    try{
      const audio = new Audio(dataUrl);
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    }catch(e){ reject(e); }
  });
}
function dismissRemind(){
  // 先清除定时器，避免重复调用
  if(dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  try{ if('speechSynthesis' in window) window.speechSynthesis.cancel(); }catch(e){}
  document.getElementById('remindOverlay').classList.remove('show');
  activeRemindId = null;
  renderAll();
  // 立即补查：可能还有其他到点事件排队
  setTimeout(checkReminders, 350);
}
// 多档贪睡：minutes 缺省 10（兼容旧调用）
function snoozeRemind(minutes){
  minutes = minutes || 10;
  const e = findEvent(activeRemindId);
  // 先清除定时器，避免重复调用
  if(dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  document.getElementById('remindOverlay').classList.remove('show');
  try{ if('speechSynthesis' in window) window.speechSynthesis.cancel(); }catch(err){}
  if(e){
    const d = new Date(Date.now() + minutes*60000);
    e.snooze = `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    persist(); renderAll();
    toast(`已延后到 ${e.snooze.slice(11)} 再提醒`);
  }
  activeRemindId = null;
}
// 在提醒弹层直接标记完成
function completeRemind(){
  const e = findEvent(activeRemindId);
  // 先清除定时器，避免重复调用
  if(dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  document.getElementById('remindOverlay').classList.remove('show');
  try{ if('speechSynthesis' in window) window.speechSynthesis.cancel(); }catch(err){}
  if(e){
    const t = todayStr();
    if(occursOn(e, t) && !(e.doneOn||[]).includes(t)) e.doneOn.push(t);
    persist(); renderAll();
    toast(`「${e.name}」已完成`);
  }
  activeRemindId = null;
}

/* ---------------- 错过提醒 ---------------- */
let missedBannerHidden = false;
// 用户手动关闭的错过提醒按天持久化：切 App / WebView 重建后不再重复弹出
function missedHiddenKey(){ return 'shiguang_missed_hidden_' + todayStr(); }
function getHiddenMissedIds(){
  try{ return new Set(JSON.parse(localStorage.getItem(missedHiddenKey()) || '[]')); }
  catch(e){ return new Set(); }
}
// 扫描今天已到点但从未触发且未完成的事件（网页版前台轮询被节流时会用到）
function scanMissed(){
  const t = todayStr();
  const nowHHMM = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  return events.filter(e => {
    if(!occursOn(e, t) || isDoneOn(e, t)) return false;
    if(e.snooze) return false;              // 有贪睡覆盖：等待贪睡时间，不算错过
    if((e.firedOn||[]).includes(t)) return false;  // 已弹过提醒：不算错过
    return e.time <= nowHHMM;
  }).sort((a,b) => a.time.localeCompare(b.time));
}
function hideMissedBanner(){
  // 把当前错过的所有事件记入“今日已忽略”，持久化到 localStorage
  try{
    const key = missedHiddenKey();
    const hidden = getHiddenMissedIds();
    scanMissed().forEach(e => hidden.add(e.id));
    localStorage.setItem(key, JSON.stringify(Array.from(hidden)));
  }catch(e){}
  missedBannerHidden = true;
  renderHome();
}
function resetMissedBanner(){ missedBannerHidden = false; }
