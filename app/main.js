// 拾光 · 启动装配（渲染、时钟、轮询、音频预热）
/* ---------------- 启动 ---------------- */
function renderAll(){ renderHome(); renderUpcoming(); renderCalendar(); }
// 原生侧动作合并：通知栏/全屏弹窗点过"完成"的事件，回到 App 同步状态
async function mergeNativeActions(){
  if(!window.__NATIVE__ || !window.__consumeNativeActions) return;
  try{
    const acts = await window.__consumeNativeActions();
    const done = acts && acts.done || {};
    const fired = acts && acts.fired || {};
    let changed = false;
    events.forEach(e => {
      const d = done[e.id];
      if(typeof d === 'string' && d){
        d.split(',').forEach(x => { x = x.trim(); if(x && !(e.doneOn||[]).includes(x)){ (e.doneOn = e.doneOn||[]).push(x); changed = true; } });
      }
      const f = fired[e.id];
      if(typeof f === 'string' && f){
        f.split(',').forEach(x => { x = x.trim(); if(x && !(e.firedOn||[]).includes(x)){ (e.firedOn = e.firedOn||[]).push(x); changed = true; } });
      }
    });
    if(changed){ persist(); renderAll(); }
  }catch(e){}
}
function tickClock(){
  const clockEl = document.getElementById('clock');
  if(!clockEl) return;
  const d = new Date();
  clockEl.textContent = `${d.getHours()}:${pad(d.getMinutes())}`;
}
load();
loadCustomEmojis();
initTheme();
// 修复：切 App/WebView 重建后重新应用已保存的背景颜色（此前 loadBgColor 从未被调用）
loadBgColor();
// 关键修复：App 启动时全量重注册原生闹钟。
// 国产 ROM“杀后台/一键清理”会清除 AlarmManager 闹钟，
// 若不重注册，杀后台后到点将无任何提醒（只有打开 App 的 JS 轮询兜底）。
syncNativeNotifs();
// 原生环境权限体检：缺权限时主动请求 + 醒目提示
setTimeout(() => {
  if(window.__NATIVE__ && typeof window.__getPermStatus === 'function'){
    window.__getPermStatus().then(async s => {
      const missing = [];
      if(!s.notifications){
        missing.push('通知权限');
        // 主动弹系统授权框（若之前拒绝过，系统不再弹，转由 toast 引导去设置）
        try{ await window.__requestNotifPerm(); }catch(e){}
      }
      if(s.exactAlarms === false) missing.push('精确闹钟权限');
      if(s.fullScreenIntent === false) missing.push('锁屏全屏弹窗权限');
      if(s.batteryRestricted) missing.push('后台运行不受限制');
      if(missing.length){
        toast('⚠️ ' + missing.join('、') + '未开启！到点可能只有声音没有弹窗。请到 设置 → 权限中心 一键开启');
      }
    }).catch(() => {});
  }
}, 1500);
// 原生侧动作合并：在通知栏/全屏弹窗上点过"完成"或已被原生提醒过的事件，回到 App 同步状态
mergeNativeActions();
// 原生 App 环境标记：隐藏仅网页开放的功能（导入/导出 JSON）
function applyNativeOnly(){
  if(!window.__NATIVE__) return;
  document.body.classList.add('native-app');
  // 直接操作 DOM 双保险隐藏
  document.querySelectorAll('.web-only').forEach(el => el.style.display = 'none');
}
applyNativeOnly();
// Android 安全区域：WebView 的 env(safe-area-inset-top) 常为 0，从原生获取真实状态栏高度
function applyNativeSafeArea(){
  if(window.__NATIVE__ && typeof window.__getStatusBarHeight === 'function'){
    window.__getStatusBarHeight().then(px => {
      const dpr = window.devicePixelRatio || 1;
      const cssPx = Math.round(px / dpr);
      if(cssPx > 0){
        document.documentElement.style.setProperty('--safe-top', cssPx + 'px');
      }
    }).catch(() => {});
  }
}
applyNativeSafeArea();
window.addEventListener('resize', applyNativeSafeArea);
// 系统深浅色切换时（用户选了“跟随系统”）自动刷新主题
if(window.matchMedia){
  try{
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSys = () => { try{ if((localStorage.getItem('shiguang_theme') || 'system') === 'system') initTheme(); }catch(e){} };
    if(mq.addEventListener) mq.addEventListener('change', onSys);
    else if(mq.addListener) mq.addListener(onSys);
  }catch(e){}
}
buildChips();
initCalendar();
renderAll();
renderBackupList();
renderNativePerms();
// 大对象迁移（base64 → IndexedDB）：完成后刷新视图与表单 chips
window.__mediaReady = migrateMediaAsync().then((migrated) => {
  if(migrated){ buildChips(); renderAll(); }
});
loadVoicePacks();
tickClock();
setInterval(tickClock, 15000);
setInterval(checkReminders, 5000);
// 回到前台立即补查：后台标签的定时器会被浏览器节流，切回时可能错过触发
// 注意：不再调用 resetMissedBanner()，否则用户手动隐藏的错过提醒横幅会被反复弹出
document.addEventListener('visibilitychange', () => { if(!document.hidden){ mergeNativeActions(); checkReminders(); renderHome(); } });
// 首次触摸/点击预热音频：iOS Safari 需要用户手势才能解锁 AudioContext
function warmAudio(){
  try{
    chimeCtx = chimeCtx || new (window.AudioContext || window.webkitAudioContext)();
    if(chimeCtx.state === 'suspended') chimeCtx.resume().catch(()=>{});
  }catch(e){}
  window.removeEventListener('pointerdown', warmAudio);
  window.removeEventListener('keydown', warmAudio);
}
window.addEventListener('pointerdown', warmAudio);
window.addEventListener('keydown', warmAudio);

