// 拾光 · 数据层与核心逻辑（常量、存储、重复规则、导入校验）
/* ---------------- 数据层 ---------------- */
const STORE_KEY = 'shiguang_events_v2';
const EMOJIS = ['🐶 收工啦','🐹 加油','🐨 轻松一下','🐼 早点休息','🐰 动一动','🐱 完成啦','🐸 喝水','🦉 晚安','🦄 好运','🐯 冲刺','🐙 灵感','🦊 太棒了','🐳 深呼吸','🐝 专注','🦋 放松','🌈 开心'];
const VOICES = ['甜美学妹','阳光少女','软萌少女','清新校园','温柔同桌','活泼班长','治愈少女','俏皮助手','清甜女声','元气萌声','自然女声','温柔姐姐','知性女声','轻快少女','甜美小贝','温柔小妮','清爽晓晓','端庄小艺','磁性男声','阳光男声','温和男声','厚重男声','沉稳男声','活力男声','标准播报','仅铃声','自定义录音'];
const VOICE_PHRASES = {
  '甜美学妹':['学长学姐，温馨提醒哦'],'阳光少女':['元气满满，该行动啦'],'软萌少女':['叮咚，不要忘记哦'],
  '清新校园':['拾光提醒你'],'温柔同桌':['轻轻提醒你一下'],'活泼班长':['注意啦，现在开始完成任务'],
  '治愈少女':['慢慢来，记得处理这项安排'],'俏皮助手':['嗨，你有一件事情要做'],
  '清甜女声':['温馨提醒'],'元气萌声':['叮咚，该行动啦'],'自然女声':['拾光提醒'],
  '温柔姐姐':['轻轻提醒你'],'知性女声':['温馨提醒，请注意时间安排'],'轻快少女':['嗨，有事情要记住哦'],
  '甜美小贝':['你好呀，温馨提醒'],'温柔小妮':['要记住这件事情哦'],'清爽晓晓':['叮，提醒来啦'],'端庄小艺':['拾光提醒你，请注意'],
  '磁性男声':['请注意，你有一项安排'],'阳光男声':['加油，现在开始完成它'],'温和男声':['记得处理这项安排'],'厚重男声':['重要提醒，请及时完成'],
  '沉稳男声':['请注意，你有一项安排'],'活力男声':['加油，现在开始完成它'],
  '标准播报':['拾光提醒'],'仅铃声':['仅播放闹钟铃声']
};

let events = [];          // {id,name,note,date,time,emoji,voice,weekdays:[1..7],doneOn:[dates],firedOn:[dates]}
let currentDetailId = null;
let editingId = null;     // 正在编辑的事件 id，null 表示新建
let lastPage = 'page-home';
let calYear, calMonth, selDate;
let activeRemindId = null;
let selectedEmoji = EMOJIS[0], selectedVoice = VOICES[0];
let customEmojis = [];         // 新版存 emoji:<uid> 引用，旧版存 dataURL（迁移时转换）
const emojiCache = {};         // emoji:<uid> → dataURL（启动/迁移时预载到内存）
function emojiIcon(value){ return String(value || '⏰').split(' ')[0]; }
// 解析自定义表情为可渲染的图片地址（内置表情返回空）
function emojiSrc(value){
  if(isDataUrl(value)) return value;
  if(isEmojiRef(value)) return emojiCache[value] || '';
  return '';
}
function loadCustomEmojis(){
  try{ const x = JSON.parse(localStorage.getItem('shiguang_custom_emojis') || '[]'); customEmojis = Array.isArray(x) ? x : []; }catch(e){ customEmojis = []; }
}
function persistCustomEmojis(){ try{ localStorage.setItem('shiguang_custom_emojis', JSON.stringify(customEmojis)); }catch(e){ toast('表情图片存储空间不足'); } }
async function importEmojiImages(ev){
  const files = Array.from(ev.target.files || []).slice(0, 12);
  ev.target.value = '';
  let added = 0, invalid = 0;
  for(const file of files){
    if(!file.type.startsWith('image/') || file.size > 400000){ invalid++; continue; }
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    }).catch(() => null);
    if(typeof dataUrl !== 'string') continue;
    // 去重：同一张图不重复导入
    if(isDataUrl(dataUrl)){
      const dupKey = customEmojis.find(k => isEmojiRef(k) && emojiCache[k] === dataUrl);
      if(dupKey) continue;
      if(await mediaProbe()){
        const key = 'emoji:' + uid();
        await mediaPut(key, dataUrl).catch(() => {});
        emojiCache[key] = dataUrl;
        customEmojis.push(key);
      } else {
        if(customEmojis.includes(dataUrl)) continue;
        customEmojis.push(dataUrl);
      }
      added++;
    }
  }
  persistCustomEmojis();
  if(added) buildChips();
  toast(added ? `已导入 ${added} 张表情图片` : (invalid ? '图片需小于 400KB 且为图片格式' : '未导入新图片'));
}
function allEmojiValues(){ return EMOJIS.concat(customEmojis); }

function pad(n){ return String(n).padStart(2,'0'); }
function todayStr(d){ d = d || new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    events = raw ? JSON.parse(raw) : [];
  }catch(e){ events = []; }
  if(!Array.isArray(events)) events = [];
  // 一次性清理旧版本内置的示例事件（仅当事件与示例模板完全一致时才移除，不误删用户数据）
  try{
    if(!localStorage.getItem('shiguang_demo_cleared')){
      const kept = events.filter(e => !isDemoSeed(e));
      if(kept.length !== events.length) localStorage.setItem('shiguang_demo_cleared', '1');
      events = kept;
    }
  }catch(e){}
  // 数据迁移：v2(done/fired) → v3(weekdays/doneOn/firedOn)
  events.forEach(e => {
    if(e.weekdays === undefined) e.weekdays = [];
    if(!Array.isArray(e.doneOn)){ e.doneOn = e.done ? [e.date] : []; delete e.done; }
    if(!Array.isArray(e.firedOn)){ e.firedOn = e.fired ? [e.date] : []; delete e.fired; }
  });  persist();
}
// 大对象迁移：把 localStorage 里的内联 base64（录音/表情）搬进 IndexedDB，原位置只留引用
// 完成后预载表情缓存并重渲染；IndexedDB 不可用时保持 legacy 内联路径。
async function migrateMediaAsync(){
  try{
    const ok = await mediaProbe();
    if(!ok) return false;
    let changed = false;
    const valKeyMap = {};   // dataURL → key（同图去重）
    // 1) 自定义表情列表
    let legacyList = [];
    try{ legacyList = JSON.parse(localStorage.getItem('shiguang_custom_emojis') || '[]'); }catch(e){}
    const nextList = [];
    if(Array.isArray(legacyList)){
      for(const item of legacyList){
        if(isDataUrl(item)){
          let key = valKeyMap[item];
          if(!key){ key = 'emoji:' + uid(); valKeyMap[item] = key; await mediaPut(key, item).catch(() => {}); }
          nextList.push(key); changed = true;
        } else if(isEmojiRef(item)){ nextList.push(item); }
      }
    }
    customEmojis = nextList;
    // 2) 事件内联表情 → 引用；录音 → rec:<id>
    for(const e of events){
      if(isDataUrl(e.emoji)){
        let key = valKeyMap[e.emoji];
        if(!key){ key = 'emoji:' + uid(); valKeyMap[e.emoji] = key; await mediaPut(key, e.emoji).catch(() => {}); }
        e.emoji = key; changed = true;
      }
      if(typeof e.voiceData === 'string' && /^data:audio/i.test(e.voiceData)){
        const key = 'rec:' + e.id;
        await mediaPut(key, e.voiceData).catch(() => {});
        e.voiceData = key; changed = true;
      }
    }
    // 3) 预载表情缓存（含历史导入的引用，保证渲染同步）
    const keys = await mediaKeys('emoji:');
    for(const k of keys){
      if(!emojiCache[k]) emojiCache[k] = await mediaGet(k);
    }
    if(changed){ persistCustomEmojis(); persist(); }
    return true;
  }catch(e){ return false; }
}
function persist(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(events));
    syncNativeNotifs();
    writeAutoBackup();
  }catch(e){
    // 存储满/不可用：多为大体积内联数据撑爆配额
    toast('本机存储空间不足，最新修改可能未保存');
    console.warn('persist failed:', e);
  }
}
/* ---------------- 自动备份（滚动快照） ---------------- */
const BACKUP_LATEST_KEY = 'shiguang_backup_latest';
const BACKUP_HISTORY_KEY = 'shiguang_backup_history';
const BACKUP_MAX = 10;
// 备份快照剔除内联大对象，只保留元数据与媒体引用
function stripForBackup(e){
  const c = Object.assign({}, e);
  if(isDataUrl(c.voiceData)) delete c.voiceData;
  return c;
}
function writeAutoBackup(){
  // 空事件不生成备份快照（清空/初始化等 0 事件场景不应污染备份历史）
  if(!events.length) return;
  try{
    const snapshot = { at: new Date().toISOString(), count: events.length, events: events.map(stripForBackup) };
    localStorage.setItem(BACKUP_LATEST_KEY, JSON.stringify(snapshot));
    let hist = [];
    try{ hist = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]'); }catch(e){}
    if(!Array.isArray(hist)) hist = [];
    // 30 分钟内且事件数未变不重复入历史（最新快照始终实时刷新），否则压入历史顶部
    const last = hist[0];
    const freshEnough = last && (Date.now() - new Date(last.at).getTime() < 30*60000) && last.count === events.length;
    if(!freshEnough){
      hist.unshift(snapshot);
      hist = hist.slice(0, BACKUP_MAX);
      localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(hist));
    }
  }catch(e){/* 备份失败不阻断主流程 */}
}
function listBackups(){
  try{
    const h = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]');
    return Array.isArray(h) ? h : [];
  }catch(e){ return []; }
}
function latestBackup(){
  try{
    const s = JSON.parse(localStorage.getItem(BACKUP_LATEST_KEY) || 'null');
    return s && Array.isArray(s.events) ? s : null;
  }catch(e){ return null; }
}
// 从快照恢复（事件按 id 去重；引用型录音在 IDB 中仍存在时自动可用）
function restoreBackup(entry){
  if(!entry || !Array.isArray(entry.events)) return { ok:false, n:0 };
  const incoming = [];
  const seen = new Set();
  entry.events.forEach(raw => {
    const e = sanitizeEvent(raw);
    if(e && !seen.has(e.id)){ seen.add(e.id); incoming.push(e); }
  });
  events = incoming;
  persist(); renderAll();
  return { ok:true, n:incoming.length };
}
function deleteBackup(at){
  try{
    const h = listBackups().filter(x => x.at !== at);
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(h));
    return true;
  }catch(e){ return false; }
}
// 原生环境：把所有未来提醒注册为本地通知（全量对账，简单可靠）
function syncNativeNotifs(){
  if(!window.__NATIVE__ || !window.__scheduleNotif) return;
  const t = todayStr();
  const nowStamp = `${t}T${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  events.forEach(e => {
    const items = [];
    if(e.snooze && e.snooze > nowStamp) items.push({at:e.snooze, body:notificationText(e)});
    else {
      // 为重复事件预注册未来 30 次，解决 App 被杀后只在打开时提醒的问题
      const start = new Date(`${t}T00:00:00`);
      for(let i=0;i<370 && items.length<30;i++){
        const d = new Date(start.getTime() + i*86400000);
        const ds = todayStr(d);
        if(!occursOn(e, ds)) continue;
        const at = `${ds}T${e.time}:00`;
        if(at > nowStamp && !(e.doneOn||[]).includes(ds)) items.push({at, body:notificationText(e)});
      }
    }
    if(items.length) window.__scheduleNotif({id:e.id,name:e.name,note:e.note,emoji:e.emoji,voice:e.voice,items});
    else window.__cancelNotif(e.id);
  });
}
function notificationText(e){
  if(e.isBirthday) return `🎂 今天是「${e.name}」的生日，祝生日快乐！${e.note ? e.note : ''}`.trim();
  const phrase = e.voice && VOICE_PHRASES[e.voice] ? VOICE_PHRASES[e.voice][0] : '';
  return [phrase, e.note].filter(Boolean).join('：') || '到点提醒';
}

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

// 旧版内置示例事件模板：用于一次性清理，只有名称/备注/时间/表情全部一致才视为示例事件
function isDemoSeed(e){
  const seeds = [
    {name:'提交周报',note:'整理本周项目进度和下周计划',time:'09:30',emoji:'🐹 打工人加油'},
    {name:'午休散步',note:'离开电脑 20 分钟，去楼下走走',time:'12:00',emoji:'🐨 轻松一下'},
    {name:'下班',note:'收拾桌面，关闭电脑，准时回家',time:'18:00',emoji:'🐶 收工啦'},
    {name:'牙医预约',note:'记得带医保卡',time:'10:00',emoji:'🐼 早点休息'}
  ];
  return seeds.some(s => e.name===s.name && e.note===s.note && e.time===s.time && e.emoji===s.emoji);
}

/* ---------------- 重复规则 ---------------- */
const WD_NAMES = ['','一','二','三','四','五','六','日'];
function weekdayOf(dateStr){ const d = new Date(dateStr+'T00:00:00'); return d.getDay() === 0 ? 7 : d.getDay(); }
function occursOn(e, ds){
  // 生日事件：每年一次（公历或农历匹配月+日）
  if(e.isBirthday){
    if(e.lunarBirthday){
      const cur = solarToLunar(ds);
      const base = solarToLunar(e.date);
      return !cur.isLeap && !base.isLeap && cur.month === base.month && cur.day === base.day;
    }
    return ds.slice(5) === e.date.slice(5) && ds >= e.date; // 生日当天及以后的年份才触发
  }
  if(!e.weekdays || !e.weekdays.length) return e.date === ds;  // 不重复：仅当天
  if(ds < e.date) return false;  // 重复事件以首次日期为起点
  return e.weekdays.includes(weekdayOf(ds));
}
function isDoneOn(e, ds){ return (e.doneOn||[]).includes(ds); }
function repeatLabel(e){
  if(e.isBirthday) return e.lunarBirthday ? '农历生日' : '生日';
  if(!e.weekdays || !e.weekdays.length) return '';
  if(e.weekdays.length === 7) return '每天';
  const wk = [1,2,3,4,5];
  if(e.weekdays.length === 5 && wk.every(d => e.weekdays.includes(d))) return '周一到周五';
  return '周' + e.weekdays.slice().sort().map(d => WD_NAMES[d]).join('、');
}
// 重复事件：从 from 起找下一个生效日（含 from），找不到返回 null
function nextOccur(e, from){
  if(!e.weekdays || !e.weekdays.length) return e.date >= from ? e.date : null;
  const fromD = new Date(from + 'T00:00:00');
  for(let i=0;i<370;i++){
    const d = new Date(fromD.getTime() + i*86400000);
    const ds = todayStr(d);
    if(occursOn(e, ds)) return ds;
  }
  return null;
}


