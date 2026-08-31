// 绸缪 · 设置页（导入导出、清空、离线语音包、主题与备份）
/* ---------------- 设置页操作 ---------------- */
function exportData(){
  try{
    const payload = { app: 'shiguang', version: 3, exportedAt: new Date().toISOString(), count: events.length, events };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const d = new Date();
    a.download = `绸缪备份_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast(`已导出 ${events.length} 个事件`);
  }catch(e){ toast('导出失败：' + e.message); }
}

function importData(fileEv){
  const file = fileEv.target.files && fileEv.target.files[0];
  fileEv.target.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data || data.app !== 'shiguang' || !Array.isArray(data.events)){ toast('导入失败：不是有效的绸缪备份文件'); return; }
      const incoming = []; const skipped = [];
      data.events.forEach(raw => { const e = sanitizeEvent(raw); if(e) incoming.push(e); else skipped.push(raw); });
      if(!incoming.length){ toast('导入失败：文件中没有有效事件'); return; }
      const byId = new Map(events.map(e => [e.id, e])); let merged = 0, added = 0;
      incoming.forEach(e => { if(byId.has(e.id)) merged++; else added++; byId.set(e.id, e); });
      events = Array.from(byId.values()); persist(); renderAll(); renderBackupList();
      toast(`导入成功：新增 ${added}，更新 ${merged}`);
    }catch(e){ toast('导入失败：文件解析错误'); }
  };
  reader.onerror = () => toast('导入失败：无法读取文件');
  reader.readAsText(file, 'utf-8');
}

function sanitizeEvent(raw){
  if(!raw || typeof raw !== 'object') return null;
  if(!raw.id || typeof raw.id !== 'string') return null;
  if(!raw.name || typeof raw.name !== 'string') return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.date || '')) return null;
  if(!/^\d{2}:\d{2}$/.test(raw.time || '')) return null;
  const e = { id: raw.id, name: raw.name.slice(0, 30), note: raw.note || '', date: raw.date, time: raw.time,
    emoji: raw.emoji || EMOJIS[0], voice: VOICES.includes(raw.voice) ? raw.voice : VOICES[0],
    weekdays: raw.weekdays || [], doneOn: raw.doneOn || [], firedOn: raw.firedOn || [] };
  if(typeof raw.voiceData === 'string'){ if(/^data:audio/.test(raw.voiceData)) e.voiceData = raw.voiceData;
    else if(/^rec:[A-Za-z0-9_\-]+$/.test(raw.voiceData)) e.voiceData = raw.voiceData; }
  if(raw.snooze && typeof raw.snooze === 'string') e.snooze = raw.snooze;
  return e;
}

function clearAll(){
  if(!confirm('确定清空全部事件吗？')) return;
  events.forEach(e => { if(isRecRef(e.voiceData)) mediaDel(e.voiceData); });
  events = []; persist(); renderAll(); renderBackupList(); toast('已清空全部事件');
}

/* ---------------- 外观主题（深色模式） ---------------- */
const THEME_KEY = 'shiguang_theme';
function resolveSystemDark(){ try{ return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }catch(e){ return false; } }
function applyTheme(theme){
  const rootEl = document.documentElement;
  let resolved = theme;
  if(theme === 'system') resolved = resolveSystemDark() ? 'dark' : 'light';
  rootEl.setAttribute('data-theme', resolved);
}
function initTheme(){
  let theme = 'system';
  try{ theme = localStorage.getItem(THEME_KEY) || 'system'; }catch(e){}
  if(theme !== 'light' && theme !== 'dark') theme = 'system';
  applyTheme(theme);
  const chips = document.querySelectorAll('#themeChips .chip');
  chips.forEach(c => c.classList.toggle('selected', c.dataset.theme === theme));
}
function setTheme(theme, btn){
  try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
  applyTheme(theme);
  document.querySelectorAll('#themeChips .chip').forEach(c => c.classList.toggle('selected', c === btn));
  toast(theme === 'dark' ? '已切换深色模式' : theme === 'light' ? '已切换浅色模式' : '已切换跟随系统');
}

/* ---------------- 背景颜色自定义 ---------------- */
const BG_COLOR_KEY = 'shiguang_bg_color';
const DEFAULT_COLORS = ['#eef4f1', '#fef3c7', '#fce7f3', '#e0e7ff', '#fecaca', '#ccfbf1', '#f5d0fe'];
let currentBgColor = null;

function loadBgColor(){
  try{ currentBgColor = localStorage.getItem(BG_COLOR_KEY) || DEFAULT_COLORS[0]; }catch(e){ currentBgColor = DEFAULT_COLORS[0]; }
  renderBgChips(); updateBgGradient(currentBgColor);
}

function saveBgColor(color){
  try{ localStorage.setItem(BG_COLOR_KEY, color); currentBgColor = color; updateBgGradient(color); toast(`背景已更改为 ${color}`); }catch(e){ toast('保存失败'); }
}

function renderBgChips(){
  const container = document.getElementById('bgColorChips');
  if(!container) return;
  container.innerHTML = DEFAULT_COLORS.map(color => `<button type="button" class="chip bg-chip" style="background-color: ${color}" onclick="selectBgColor('${color}', this)" title="${color}">
    ${currentBgColor === color ? '<span style="color:white;font-weight:bold">✓</span>' : ''}</button>`).join('');
}

function selectBgColor(color, btn){ saveBgColor(color); renderBgChips(); }

function updateBgGradient(bgColor){
  const root = document.documentElement;
  root.style.setProperty('--page-bg', `linear-gradient(180deg, ${bgColor} 0%, #fafbfc 100%)`);
  try {
    if(root.getAttribute('data-theme') === 'dark'){
      const r = parseInt(bgColor.slice(1, 3), 16), g = parseInt(bgColor.slice(3, 5), 16), b = parseInt(bgColor.slice(5, 7), 16);
      const dr = Math.max(0, Math.floor(r * 0.8)), dg = Math.max(0, Math.floor(g * 0.8)), db = Math.max(0, Math.floor(b * 0.8));
      const darkColor = `#${dr.toString(16).padStart(2,'0')}${dg.toString(16).padStart(2,'0')}${db.toString(16).padStart(2,'0')}`;
      root.style.setProperty('--page-bg-dark', `linear-gradient(180deg, ${darkColor} 0%, #0a0e0b 100%)`);
    }
  } catch(e) {}
}

/* ---------------- 自动备份 UI ---------------- */
function formatAt(at){ try{ const d = new Date(at); return `${d.getMonth()+1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`; }catch(e){ return String(at); } }
function renderBackupList(){
  const box = document.getElementById('backupList');
  if(!box) return;
  const list = listBackups();
  if(!list.length){ box.innerHTML = '<small class="mini">暂无历史备份（保存事件后自动生成）</small>'; return; }
  box.innerHTML = list.map(b => `<div class="backup-item"><div class="backup-info"><b>${formatAt(b.at)}</b><small>${b.count} 个事件</small></div>
    <div class="backup-actions"><button class="secondary" onclick="restoreBackupEntry('${b.at}')">恢复</button>
    <button class="danger-btn" onclick="removeBackupEntry('${b.at}')">删除</button></div></div>`).join('');
}
function restoreBackupEntry(at){
  const entry = listBackups().find(x => x.at === at);
  if(!entry) return;
  if(!confirm(`恢复到 ${formatAt(at)} 的快照？当前 ${events.length} 个事件将被替换。`)) return;
  const r = restoreBackup(entry);
  if(r.ok){ toast(`已恢复 ${r.n} 个事件`); renderBackupList(); } else toast('恢复失败');
}
function removeBackupEntry(at){ if(!confirm('删除这条备份快照？')) return; deleteBackup(at); renderBackupList(); toast('已删除备份快照'); }

/* ---------------- 原生权限引导（仅 Android App） ---------------- */
async function renderNativePerms(){
  const card = document.getElementById('nativePermCard');
  if(!card) return;
  if(!window.__NATIVE__ || !window.__getPermStatus){ card.style.display = 'none'; return; }
  card.style.display = 'block';
  const rows = document.getElementById('nativePermRows');
  if(!rows) return;
  const s = await window.__getPermStatus();
  const row = (label, ok, action, desc) => `<div class="backup-item"><div class="backup-info"><b>${ok ? '✅' : '⚠️'} ${label}</b><small>${desc}</small></div>
    <div class="backup-actions">${ok ? '' : `<button class="secondary" onclick="${action}">去开启</button>`}</div></div>`;
  if(window.__IS_IOS__){
    // iOS：只有通知权限一项，其余由系统保证
    rows.innerHTML = [
      row('通知权限', !!s.notifications, '__permNotif()', '锁屏/通知中心提醒'),
      row('通知精确度', true, '', 'iOS 系统通知准时触发'),
      row('锁屏横幅', true, '', 'iOS 锁屏自动展示提醒'),
    ].join('');
  } else {
    rows.innerHTML = [
      row('通知权限', !!s.notifications, '__permNotif()', '到点展示系统通知'),
      row('精确闹钟', !!s.exactAlarms, '__permExact()', '保证准时触发'),
      row('全屏通知', !!s.fullScreenIntent, '__permFullScreen()', '锁屏时全屏提醒'),
      row('电池优化豁免', !s.batteryRestricted, '__permBattery()', '后台不被系统限制'),
    ].join('');
  }
}
async function __permNotif(){ try{ await window.__requestNotifPerm(); }catch(e){} renderNativePerms(); }
async function __permExact(){ try{ await window.__openExactAlarmSettings(); }catch(e){} renderNativePerms(); }
async function __permFullScreen(){ try{ await window.__openFullScreenSettings(); }catch(e){} renderNativePerms(); }
async function __permBattery(){ try{ await window.__openBatterySettings(); }catch(e){} renderNativePerms(); }

let voicePackCatalog = [];
async function loadVoicePacks(){
  const box = document.getElementById('voicePackList');
  if(!box) return;
  if(!window.__listVoicePacks){ box.innerHTML='<small>网页版无需管理离线语音包</small>'; return; }
  box.innerHTML='<small>正在读取语音包…</small>';
  const data = await window.__listVoicePacks(); voicePackCatalog = data.packs || [];
  box.innerHTML = voicePackCatalog.map(p => `<div class="detail-card" style="margin:8px 0;padding:12px"><b>${esc(p.name)}</b>
    <small>${p.sampleRate ? Math.round(p.sampleRate/1000)+'kHz' : ''}</small><p class="mini">${esc(p.description||'')}</p>
    <small>${(p.voices||[]).map(v=>esc(v.id)).join(' · ')}</small>
    <div style="margin-top:8px">${p.installed ? `<button class="secondary" onclick="previewVoicePack('${p.id}')">试听</button> ${p.bundled?'':`<button class="danger-btn" onclick="removeVoicePack('${p.id}')">删除</button>`}` : `<button class="primary" onclick="downloadVoicePackById('${p.id}',this)">下载语音包</button>`}</div></div>`).join('') || '<small>暂无语音包</small>';
}
async function downloadVoicePackById(id, btn){
  const p=voicePackCatalog.find(x=>x.id===id); if(!p) return;
  btn.disabled=true; btn.textContent='下载中…';
  try{ await window.__downloadVoicePack(p); toast('语音包已下载，正在安装'); await loadVoicePacks(); }
  catch(e){ btn.disabled=false; btn.textContent='重新下载'; toast('下载失败'); }
}
async function removeVoicePack(id){ if(!confirm('删除这个离线语音包吗？')) return; await window.__deleteVoicePack(id); await loadVoicePacks(); toast('语音包已删除'); }
async function previewVoicePack(id){
  const p=voicePackCatalog.find(x=>x.id===id); if(!p) return;
  const voice=(p.voices&&p.voices[0]&&p.voices[0].id)||'甜美学妹';
  if(!window.__previewVoice){ toast('请在 Android App 中试听'); return; }
  toast(`正在生成「${voice}」试听语音…`);
  try{ await window.__previewVoice(voice,'你好呀，这里是绸缪。记得按时完成今天的安排哦。'); }catch(e){ toast('试听失败'); }
}
