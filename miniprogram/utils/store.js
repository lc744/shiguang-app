// 绸缪小程序 · 存储层（wx.setStorageSync + 文件系统存大对象）——移植自 Web 版 core.js/storage.js
const core = require('./core');

const STORE_KEY = 'shiguang_events_v2';
const EMOJI_KEY = 'shiguang_custom_emojis';
const DEMO_KEY = 'shiguang_demo_cleared';
const BACKUP_LATEST_KEY = 'shiguang_backup_latest';
const BACKUP_HISTORY_KEY = 'shiguang_backup_history';
const BACKUP_MAX = 10;

let events = [];
let customEmojis = [];

/* ---------------- 事件数据 ---------------- */
function loadAll(){
  try{
    const raw = wx.getStorageSync(STORE_KEY);
    events = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  }catch(e){ events = []; }
  if(!Array.isArray(events)) events = [];
  try{
    if(!wx.getStorageSync(DEMO_KEY)){
      const kept = events.filter(e => !core.isDemoSeed(e));
      if(kept.length !== events.length) wx.setStorageSync(DEMO_KEY, '1');
      events = kept;
    }
  }catch(e){}
  // 数据迁移：v2 → v3
  events.forEach(e => {
    if(e.weekdays === undefined) e.weekdays = [];
    if(!Array.isArray(e.doneOn)){ e.doneOn = e.done ? [e.date] : []; delete e.done; }
    if(!Array.isArray(e.firedOn)){ e.firedOn = e.fired ? [e.date] : []; delete e.fired; }
  });
  persist(false);
  // 自定义表情
  try{
    const x = wx.getStorageSync(EMOJI_KEY);
    customEmojis = Array.isArray(x) ? x : [];
  }catch(e){ customEmojis = []; }
}

function getEvents(){ return events; }
function setEvents(next){ events = next; persist(); }
function updateEvent(id, patch){
  const e = findEvent(id);
  if(!e) return null;
  Object.assign(e, patch);
  persist();
  return e;
}
function findEvent(id){ return events.find(e => e.id === id) || null; }

function persist(backup){
  try{
    wx.setStorageSync(STORE_KEY, JSON.stringify(events));
    if(backup !== false) writeAutoBackup();
  }catch(e){
    wx.showToast({ title: '本机存储空间不足', icon: 'none' });
  }
}

/* ---------------- 自定义表情（文件系统） ---------------- */
function getCustomEmojis(){ return customEmojis; }
function isCustomEmoji(v){ return typeof v === 'string' && (v.startsWith('wxfile:') || v.startsWith('http')); }
function emojiIcon(value){ return String(value || '⏰').split(' ')[0]; }
function emojiSrc(value){ return isCustomEmoji(value) ? value : ''; }
function allEmojiValues(){ return core.EMOJIS.concat(customEmojis); }

// 把临时图片持久化到用户目录，返回文件路径（失败返回 null）
function saveEmojiImage(tempPath){
  try{
    const fsm = wx.getFileSystemManager();
    const dest = wx.env.USER_DATA_PATH + '/emoji_' + core.uid() + '.img';
    fsm.copyFileSync(tempPath, dest);
    customEmojis.push(dest);
    persistCustomEmojis();
    return dest;
  }catch(e){ return null; }
}
function deleteEmojiImage(path){
  customEmojis = customEmojis.filter(p => p !== path);
  persistCustomEmojis();
  try{ wx.getFileSystemManager().unlinkSync(path); }catch(e){}
}
function persistCustomEmojis(){
  try{ wx.setStorageSync(EMOJI_KEY, customEmojis); }
  catch(e){ wx.showToast({ title: '表情图片存储空间不足', icon: 'none' }); }
}

/* ---------------- 自定义录音（文件系统） ---------------- */
// 保存录音临时文件，返回 file: 引用（失败返回 null）
function saveRecording(tempPath){
  try{
    const fsm = wx.getFileSystemManager();
    const dest = wx.env.USER_DATA_PATH + '/rec_' + core.uid() + '.mp3';
    fsm.copyFileSync(tempPath, dest);
    return dest;
  }catch(e){ return null; }
}
function deleteRecording(path){
  if(!path || !path.startsWith(wx.env.USER_DATA_PATH)) return;
  try{ wx.getFileSystemManager().unlinkSync(path); }catch(e){}
}
// 解析事件录音为可播放路径；没有返回 null
function resolveVoicePath(e){
  if(e.voice !== '自定义录音' || !e.voiceData) return null;
  if(e.voiceData.startsWith(wx.env.USER_DATA_PATH)) return e.voiceData;
  return null;
}

/* ---------------- 自动备份（滚动快照） ---------------- */
function stripForBackup(e){
  const c = Object.assign({}, e);
  if(typeof c.voiceData === 'string' && c.voiceData.startsWith(wx.env.USER_DATA_PATH)) delete c.voiceData;
  return c;
}
function writeAutoBackup(){
  if(!events.length) return;
  try{
    const snapshot = { at: new Date().toISOString(), count: events.length, events: events.map(stripForBackup) };
    wx.setStorageSync(BACKUP_LATEST_KEY, JSON.stringify(snapshot));
    let hist = [];
    try{ hist = JSON.parse(wx.getStorageSync(BACKUP_HISTORY_KEY) || '[]'); }catch(e){}
    if(!Array.isArray(hist)) hist = [];
    const last = hist[0];
    const freshEnough = last && (Date.now() - new Date(last.at).getTime() < 30*60000) && last.count === events.length;
    if(!freshEnough){
      hist.unshift(snapshot);
      hist = hist.slice(0, BACKUP_MAX);
      wx.setStorageSync(BACKUP_HISTORY_KEY, JSON.stringify(hist));
    }
  }catch(e){}
}
function listBackups(){
  try{
    const h = JSON.parse(wx.getStorageSync(BACKUP_HISTORY_KEY) || '[]');
    return Array.isArray(h) ? h : [];
  }catch(e){ return []; }
}
function latestBackup(){
  try{
    const s = JSON.parse(wx.getStorageSync(BACKUP_LATEST_KEY) || 'null');
    return s && Array.isArray(s.events) ? s : null;
  }catch(e){ return null; }
}
function deleteBackup(at){
  try{
    const h = listBackups().filter(x => x.at !== at);
    wx.setStorageSync(BACKUP_HISTORY_KEY, JSON.stringify(h));
    return true;
  }catch(e){ return false; }
}
// 从快照恢复（事件按 id 去重）
function restoreBackup(entry){
  if(!entry || !Array.isArray(entry.events)) return { ok:false, n:0 };
  const incoming = [];
  const seen = new Set();
  entry.events.forEach(raw => {
    const e = sanitizeEvent(raw);
    if(e && !seen.has(e.id)){ seen.add(e.id); incoming.push(e); }
  });
  events = incoming;
  persist();
  return { ok:true, n:incoming.length };
}

/* ---------------- 导入导出校验（与 Web 版备份兼容） ---------------- */
function sanitizeEvent(raw){
  if(!raw || typeof raw !== 'object') return null;
  if(!raw.id || typeof raw.id !== 'string') return null;
  if(!raw.name || typeof raw.name !== 'string') return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.date || '')) return null;
  if(!/^\d{2}:\d{2}$/.test(raw.time || '')) return null;
  const e = { id: raw.id, name: raw.name.slice(0, 30), note: raw.note || '', date: raw.date, time: raw.time,
    emoji: raw.emoji || core.EMOJIS[0], voice: core.VOICES.includes(raw.voice) ? raw.voice : core.VOICES[0],
    weekdays: raw.weekdays || [], doneOn: raw.doneOn || [], firedOn: raw.firedOn || [] };
  if(typeof raw.voiceData === 'string' && raw.voiceData.startsWith(wx.env.USER_DATA_PATH)) e.voiceData = raw.voiceData;
  if(raw.snooze && typeof raw.snooze === 'string') e.snooze = raw.snooze;
  if(raw.isBirthday) e.isBirthday = true;
  if(raw.lunarBirthday) e.lunarBirthday = true;
  return e;
}

module.exports = {
  loadAll, getEvents, setEvents, updateEvent, findEvent,
  getCustomEmojis, isCustomEmoji, emojiIcon, emojiSrc, allEmojiValues,
  saveEmojiImage, deleteEmojiImage, persistCustomEmojis,
  saveRecording, deleteRecording, resolveVoicePath,
  listBackups, latestBackup, deleteBackup, restoreBackup, sanitizeEvent, persist
};
