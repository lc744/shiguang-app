// 绸缪小程序 · 语音识别（录音 → 云函数一句话识别）
// 个人主体无法使用同声传译插件：RecorderManager 录 mp3（≤30s）→ base64 → callFunction('asr') → 文字
// 最新回调分发：RecorderManager 是全局单例，只注册一次监听，转发给最近一次会话的回调，避免重复触发
let rm = null;          // 全局录音管理器
let current = null;     // 当前会话回调 { onStart, onResult, onError }

function hasCloud(){
  try{ return !!(wx.cloud && typeof wx.cloud.callFunction === 'function'); }catch(e){ return false; }
}

function available(){
  return hasCloud() && !!wx.getRecorderManager;
}

function rec(){
  if(!rm) rm = wx.getRecorderManager();
  if(!rm.__choumou_wired){
    rm.onStop(res => {
      const cb = current; current = null;
      if(!cb) return;
      const path = res && res.tempFilePath;
      if(!path){ cb.onError && cb.onError('没有录到声音，请再试一次'); return; }
      let b64 = '';
      try{ b64 = wx.getFileSystemManager().readFileSync(path, 'base64'); }
      catch(e){ cb.onError && cb.onError('读取录音失败'); return; }
      wx.cloud.callFunction({ name: 'asr', data: { audioBase64: b64, format: 'mp3' } })
        .then(r => {
          const out = (r && r.result) || {};
          if(out.ok && out.text) cb.onResult && cb.onResult(out.text);
          else cb.onError && cb.onError(out.error || '识别失败，试试文字输入');
        })
        .catch(err => cb.onError && cb.onError((err && err.errMsg) || '网络异常，试试文字输入'));
    });
    rm.onError(err => {
      const cb = current; current = null;
      if(!cb) return;
      const msg = String((err && (err.errMsg || err.message)) || '');
      if(/auth|deny|denied|权限/i.test(msg)) cb.onError && cb.onError('麦克风权限未开启，请在设置中允许绸缪使用麦克风');
      else if(/no\s*speech|没听到|无声/i.test(msg)) cb.onError && cb.onError('没有听到声音，请再试一次');
      else cb.onError && cb.onError('录音失败，试试文字输入');
    });
    rm.__choumou_wired = true;
  }
  return rm;
}

// 开始录音并识别；handlers = { onStart, onResult(text), onError(msg) }
function startRecording(handlers){
  if(!available()){
    handlers.onError && handlers.onError('语音识别需开通云开发，请用文字输入');
    return;
  }
  const r = rec();
  current = handlers;
  wx.authorize({
    scope: 'scope.record',
    success(){
      try{
        r.start({ format: 'mp3', duration: 30000, sampleRate: 16000, encodeBitRate: 48000, numberOfChannels: 1 });
        handlers.onStart && handlers.onStart();
      }catch(e){
        current = null;
        handlers.onError && handlers.onError('录音启动失败，请用文字输入');
      }
    },
    fail(){ current = null; handlers.onError && handlers.onError('麦克风权限未开启，请在设置中允许绸缪使用麦克风'); }
  });
}

function stopRecording(){
  try{ if(rm) rm.stop(); }catch(e){}
}

module.exports = { available, startRecording, stopRecording };
