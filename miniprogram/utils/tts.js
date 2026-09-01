// 绸缪小程序 · 语音播报（微信同声传译插件 WechatSI TTS）与录音播放
// 需要在小程序管理后台「设置-第三方设置-插件管理」添加"微信同声传译"插件
let plugin = null;
try{ plugin = require('WechatSI'); }catch(e){ plugin = null; }

let inner = null;   // 复用的音频播放器

function player(){
  if(!inner){
    inner = wx.createInnerAudioContext();
    inner.obeyMuteSwitch = false;   // 提醒播报不受静音开关影响
  }
  return inner;
}

// 文本转语音并播放；插件不可用或合成失败时 reject
function speak(text){
  return new Promise((resolve, reject) => {
    if(!plugin || !plugin.textToSpeech){ reject(new Error('TTS 插件不可用')); return; }
    plugin.textToSpeech({
      lang: 'zh_CN',
      tts: true,
      content: String(text || '').slice(0, 150),
      success: res => {
        if(res.retcode === 0 && res.filename){
          const p = player();
          p.src = res.filename;
          p.onEnded(onend);
          p.onError(onerr);
          p.play();
          function onend(){ cleanup(); resolve(); }
          function onerr(){ cleanup(); reject(new Error('播放失败')); }
          function cleanup(){ p.offEnded(onend); p.offError(onerr); }
        } else {
          reject(new Error('TTS 合成失败(' + (res.retcode || -1) + ')'));
        }
      },
      fail: err => reject(new Error(err && err.errMsg || 'TTS 调用失败'))
    });
  });
}

// 播放本地音频文件（自定义录音），返回 Promise
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

function stop(){
  try{ if(inner) inner.stop(); }catch(e){}
}

function isAvailable(){ return !!(plugin && plugin.textToSpeech); }

module.exports = { speak, playFile, stop, isAvailable };
