// 绸缪小程序 · 语音播报（云开发 + 腾讯云语音合成）与录音播放
// 个人主体小程序无法使用微信同声传译插件，改为云函数路线：
//   前端 → callFunction('tts') → 腾讯云 TextToVoice → mp3 base64 → 写入用户目录缓存 → 播放
// 未开通云开发 / 调用失败时 reject，由调用方静默降级（remind 页已有 catch 兜底）
let inner = null;   // 复用的音频播放器

function player(){
  if(!inner){
    inner = wx.createInnerAudioContext();
    inner.obeyMuteSwitch = false;   // 提醒播报不受静音开关影响
  }
  return inner;
}

// 云开发能力探测（app.js onLaunch 已尝试 wx.cloud.init）
function hasCloud(){
  try{ return !!(wx.cloud && typeof wx.cloud.callFunction === 'function'); }catch(e){ return false; }
}

// 稳定文本哈希（djb2）→ 缓存文件名
function hashText(s){
  let h = 5381;
  for(let i = 0; i < s.length; i++){ h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

// 播放本地音频文件（自定义录音 / TTS 缓存），返回 Promise
function playFile(path){
  return new Promise((resolve, reject) => {
    try{
      const p = player();
      p.src = path;
      p.onEnded(onend);
      p.onError(onerr);
      p.play();
      function onend(){ cleanup(); resolve(); }
      function onerr(){ cleanup(); reject(new Error('播放失败')); }
      function cleanup(){ p.offEnded(onend); p.offError(onerr); }
    }catch(e){ reject(e); }
  });
}

// 文本转语音并播放；云能力缺失或合成失败时 reject
// 缓存文件数量上限：超出后按修改时间删最旧的，防止 USER_DATA_PATH 无限增长
const CACHE_MAX = 30;
function pruneCache(keepPath){
  try{
    const fsm = wx.getFileSystemManager();
    const dir = wx.env.USER_DATA_PATH;
    const files = fsm.readdirSync(dir)
      .filter(n => /^tts_[a-z0-9]+\.mp3$/.test(n) && dir + '/' + n !== keepPath)
      .map(n => {
        let m = 0;
        try{ m = fsm.statSync(dir + '/' + n).lastModifiedTime || 0; }catch(e){}
        return { n, m };
      })
      .sort((a, b) => a.m - b.m);
    for(let i = 0; i < files.length - (CACHE_MAX - 1); i++){
      try{ fsm.unlinkSync(dir + '/' + files[i].n); }catch(e){}
    }
  }catch(e){ /* 清理失败不影响播放 */ }
}

function speak(text){
  return new Promise((resolve, reject) => {
    if(!hasCloud()){ reject(new Error('云开发未开通，语音播报不可用')); return; }
    const t = String(text || '').trim();
    if(!t){ reject(new Error('播报内容为空')); return; }

    const cachePath = wx.env.USER_DATA_PATH + '/tts_' + hashText(t) + '.mp3';
    // 缓存命中直接播（同一文本不重复合成，省额度）
    try{
      wx.getFileSystemManager().accessSync(cachePath);
      playFile(cachePath).then(resolve, reject);
      return;
    }catch(e){ /* 无缓存，继续合成 */ }

    wx.cloud.callFunction({ name: 'tts', data: { text: t.slice(0, 150) } })
      .then(r => {
        const res = (r && r.result) || {};
        if(res.ok && res.audioBase64){
          try{ wx.getFileSystemManager().writeFileSync(cachePath, res.audioBase64, 'base64'); pruneCache(cachePath); }catch(e){}
          playFile(cachePath).then(resolve, reject);
        } else {
          reject(new Error(res.error || 'TTS 合成失败'));
        }
      })
      .catch(err => reject(new Error((err && err.errMsg) || '云函数调用失败')));
  });
}

function stop(){
  try{ if(inner) inner.stop(); }catch(e){}
}

function isAvailable(){ return hasCloud(); }

module.exports = { speak, playFile, stop, isAvailable };
