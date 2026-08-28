// 构建 Capacitor web 资源：把 index.html 复制到 www/ 并注入原生通知桥接
// 用法：node build-www.js
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'index.html');
const dist = path.join(__dirname, 'www');
const out = path.join(dist, 'index.html');

let html = fs.readFileSync(src, 'utf8');

// Capacitor 平台注入：原生环境加载桥接，浏览器环境跳过
const bridge = `
<script>
/* ---------------- Capacitor 原生桥接 ---------------- */
(function(){
  const caps = window.Capacitor;
  if(!caps || !caps.isNativePlatform || !caps.isNativePlatform()) return; // 纯浏览器直接跳过
  window.__NATIVE__ = true;
  // iOS 标记：前台提醒由 WebView 内 JS 弹层负责（系统通知前台静默），Android 由原生引擎接管
  try{ window.__IS_IOS__ = caps.getPlatform && caps.getPlatform() === 'ios'; }catch(e){ window.__IS_IOS__ = false; }
  // Capacitor 8 推荐通过 registerPlugin 获取自定义原生插件；旧版回退到 Plugins
  const NativeAlarm = caps.registerPlugin ? caps.registerPlugin('NativeAlarm') : caps.Plugins.NativeAlarm;

  // 原生闹钟权限（通知 + 精确闹钟 + 全屏通知）
  window.__requestNotifPerm = async function(){
    try{
      const s = await NativeAlarm.requestPermissions();
      if(!s.exactAlarms) await NativeAlarm.openExactAlarmSettings();
      if(!s.fullScreenIntent) await NativeAlarm.openFullScreenIntentSettings();
      return s.notifications;
    }catch(e){ return false; }
  };
  window.__openBatterySettings = async function(){ try{ await NativeAlarm.openBatterySettings(); }catch(e){} };
  window.__openNotificationSettings = async function(){ try{ await NativeAlarm.openNotificationSettings(); }catch(e){} };
  window.__openAppDetails = async function(){ try{ await NativeAlarm.openAppDetails(); }catch(e){} };
  window.__openExactAlarmSettings = async function(){ try{ await NativeAlarm.openExactAlarmSettings(); }catch(e){} };
  window.__openFullScreenSettings = async function(){ try{ await NativeAlarm.openFullScreenIntentSettings(); }catch(e){} };
  window.__getStatusBarHeight = async function(){
    try{ const r = await NativeAlarm.getStatusBarHeight(); return r.height || 0; }catch(e){ return 0; }
  };
  window.__getPermStatus = async function(){
    try{ return await NativeAlarm.getStatus(); }
    catch(e){ return { notifications:false, exactAlarms:false, fullScreenIntent:false, batteryRestricted:false }; }
  };

  window.__listVoicePacks = async function(){
    try{ return await NativeAlarm.listVoicePacks(); }catch(e){ return {packs:[]}; }
  };
  window.__downloadVoicePack = async function(pack){
    return await NativeAlarm.downloadVoicePack({id:pack.id,url:pack.downloadUrl,vocoderUrl:pack.vocoderUrl||'',sha256:pack.sha256||''});
  };
  window.__deleteVoicePack = async function(id){ return await NativeAlarm.deleteVoicePack({id}); };
  window.__previewVoice = async function(voice,text){ return await NativeAlarm.previewVoice({voice,text}); };

  // 注册未来一组本地通知。每次最多 30 条，覆盖 App 被杀后的重复提醒。
  window.__scheduleNotif = async function(payload){
    try{
      await NativeAlarm.syncEvent({
        id: payload.id,
        name: payload.name,
        emoji: payload.emoji || '',
        voice: payload.voice || '标准播报',
        items: payload.items || []
      });
    }catch(e){ console.warn('schedule notif failed', e); }
  };

  // 取消事件未来 30 条通知
  window.__cancelNotif = async function(evId){
    try{
      await NativeAlarm.cancelEvent({ id: evId });
    }catch(e){}
  };

  // 取走原生侧记录的用户动作（在通知/弹窗上点的“完成”、已触发记录）
  window.__consumeNativeActions = async function(){
    try{ return await NativeAlarm.consumeNativeActions(); }
    catch(e){ return { done: {}, fired: {} }; }
  };

  function hashId(str){
    let h = 0;
    for(let i = 0; i < str.length; i++){ h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h) % 2147483647;
  }

  // App 启动/从通知点击进入时请求权限
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => window.__requestNotifPerm());
  } else {
    window.__requestNotifPerm();
  }
})();
</script>
`;

// 注入到主脚本之前（模块化后以第一个 <script src> 为锚点）
html = html.replace('<script src="app/core.js">', bridge + '\n<script src="app/core.js">');

// 写入 www/index.html（关键步骤）
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(out, html);

// 同步复制模块资源（styles.css 与 app/*.js）
fs.rmSync(path.join(dist, 'app'), { recursive: true, force: true });
fs.cpSync(path.join(__dirname, 'app'), path.join(dist, 'app'), { recursive: true });
console.log('www/ 已生成：index.html ' + (html.length / 1024).toFixed(1) + ' KB + app/ 模块资源');
