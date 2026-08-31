// 绸缪 · 存储层：IndexedDB 大对象仓库（录音、自定义表情图片）
// localStorage 只保存小体积引用，避免大 base64 撑爆 5MB 配额。
// 不可用（如旧浏览器/无痕受限）时自动降级：调用方保持 legacy 内联数据路径。
const MEDIA_DB_NAME = 'shiguang_media';
const MEDIA_DB_VERSION = 1;
const MEDIA_STORE = 'media';

let _mediaDb = null;
let _mediaOpening = null;
let _mediaAvailable = null;   // null=未探测，true/false=已探测

function openMediaDb(){
  if(_mediaDb) return Promise.resolve(_mediaDb);
  if(_mediaOpening) return _mediaOpening;
  _mediaOpening = new Promise((resolve, reject) => {
    try{
      if(!window.indexedDB){ reject(new Error('IndexedDB unavailable')); return; }
      const req = window.indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => { _mediaDb = req.result; _mediaAvailable = true; resolve(_mediaDb); };
      req.onerror = () => { _mediaAvailable = false; reject(req.error || new Error('IndexedDB open failed')); };
      req.onblocked = () => { _mediaAvailable = false; reject(new Error('IndexedDB blocked')); };
    }catch(e){ _mediaAvailable = false; reject(e); }
  });
  return _mediaOpening;
}

// 探测是否可用（幂等；浏览器中首次调用后缓存结果）
function mediaProbe(){
  if(_mediaAvailable !== null) return Promise.resolve(_mediaAvailable);
  return openMediaDb().then(() => true).catch(() => { _mediaAvailable = false; return false; });
}

function mediaTx(mode){
  return _mediaDb.transaction(MEDIA_STORE, mode).objectStore(MEDIA_STORE);
}
function mediaPut(key, value){
  return openMediaDb().then(db => new Promise((resolve, reject) => {
    const req = mediaTx('readwrite').put({ key, value });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  }));
}
function mediaGet(key){
  return openMediaDb().then(db => new Promise((resolve, reject) => {
    const req = mediaTx('readonly').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  })).catch(() => null);
}
function mediaDel(key){
  return openMediaDb().then(db => new Promise((resolve, reject) => {
    const req = mediaTx('readwrite').delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  })).catch(() => false);
}
function mediaKeys(prefix){
  return openMediaDb().then(db => new Promise((resolve, reject) => {
    const req = mediaTx('readonly').getAllKeys();
    req.onsuccess = () => {
      const ks = (req.result || []).map(String);
      resolve(prefix ? ks.filter(k => k.startsWith(prefix)) : ks);
    };
    req.onerror = () => reject(req.error);
  })).catch(() => []);
}
// 释放连接（页面卸载时）
function mediaClose(){
  if(_mediaDb){ try{ _mediaDb.close(); }catch(e){} _mediaDb = null; _mediaOpening = null; }
}

// 媒体引用工具：录音数据 key 为 rec:<eventId>，表情图片 key 为 emoji:<uid>
function isDataUrl(v){ return typeof v === 'string' && /^data:/i.test(v); }
function isRecRef(v){ return typeof v === 'string' && /^rec:[A-Za-z0-9_\-]+$/.test(v); }
function isEmojiRef(v){ return typeof v === 'string' && /^emoji:[A-Za-z0-9_\-]+$/.test(v); }
// 是否自定义表情（旧版内联 dataURL 或新版引用）
function isCustomEmoji(v){ return isDataUrl(v) || isEmojiRef(v); }
// 解析录音引用为可直接播放的 dataURL（Promise）
function resolveVoiceData(e){
  const v = e && e.voiceData;
  if(!v) return Promise.resolve(null);
  if(isDataUrl(v)) return Promise.resolve(v);
  if(isRecRef(v)) return mediaGet(v);
  return Promise.resolve(null);
}
