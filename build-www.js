// 鏋勫缓 Capacitor web 璧勬簮锛氭妸 index.html 澶嶅埗鍒?www/ 骞舵敞鍏ュ師鐢熼€氱煡妗ユ帴
// 鐢ㄦ硶锛歯ode build-www.js
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'index.html');
const dist = path.join(__dirname, 'www');
const out = path.join(dist, 'index.html');

let html = fs.readFileSync(src, 'utf8');

// Capacitor 骞冲彴娉ㄥ叆锛氬師鐢熺幆澧冨姞杞芥ˉ鎺ワ紝娴忚鍣ㄧ幆澧冭烦杩?
const bridge = `
<script>
/* ---------------- Capacitor 鍘熺敓妗ユ帴 ---------------- */
(function(){
  const caps = window.Capacitor;
  if(!caps || !caps.isNativePlatform || !caps.isNativePlatform()) return; // 绾祻瑙堝櫒鐩存帴璺宠繃
  window.__NATIVE__ = true;
  // iOS 鏍囪锛氬墠鍙版彁閱掔敱 WebView 鍐?JS 寮瑰眰璐熻矗锛堢郴缁熼€氱煡鍓嶅彴闈欓粯锛夛紝Android 鐢卞師鐢熷紩鎿庢帴绠?
  try{ window.__IS_IOS__ = caps.getPlatform && caps.getPlatform() === 'ios'; }catch(e){ window.__IS_IOS__ = false; }
  // Capacitor 8 鎺ㄨ崘閫氳繃 registerPlugin 鑾峰彇鑷畾涔夊師鐢熸彃浠讹紱鏃х増鍥為€€鍒?Plugins
  const NativeAlarm = caps.registerPlugin ? caps.registerPlugin('NativeAlarm') : caps.Plugins.NativeAlarm;

  // Android 杩斿洖閿?渚ф粦杩斿洖锛氫紭鍏堢敱椤甸潰鍐呴儴娑堝寲锛堝叧寮瑰眰/鍥炰富椤碉級锛屽惁鍒欐渶灏忓寲搴旂敤锛堜笉璇€€鍑猴紝闂归挓鐓у父锛?
  try{
    const AppPlugin = caps.registerPlugin ? caps.registerPlugin('App') : caps.Plugins.App;
    if(AppPlugin && typeof AppPlugin.addListener === 'function'){
      AppPlugin.addListener('backButton', () => {
        if(window.__handleBackGesture && window.__handleBackGesture()) return;
        Promise.resolve(AppPlugin.minimizeApp()).catch(() => {});
      });
    }
  }catch(e){}

  // 鍘熺敓闂归挓鏉冮檺锛堥€氱煡 + 绮剧‘闂归挓 + 鍏ㄥ睆閫氱煡锛?
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
  window.__onVoiceProgress = null;
  try{
    NativeAlarm.addListener('voiceProgress', (ev) => {
      const d = ev && (ev.data || ev);
      if(window.__onVoiceProgress && d) window.__onVoiceProgress(d);
    });
  }catch(e){}
  window.__downloadVoicePack = async function(pack){
    return await NativeAlarm.downloadVoicePack({id:pack.id,url:pack.downloadUrl,githubUrl:pack.githubUrl||'',vocoderUrl:pack.vocoderUrl||'',sha256:pack.sha256||''});
  };
  window.__deleteVoicePack = async function(id){ return await NativeAlarm.deleteVoicePack({id}); };
  window.__previewVoice = async function(voice,text){ return await NativeAlarm.previewVoice({voice,text}); };

  // 鍘熺敓璇煶璇嗗埆锛堢桓缂簿鐏碉級锛氳繑鍥?{text} 鎴?{errorCode, message}锛屾瘮 WebView 鐨?webkitSpeechRecognition 鏇村彲闈狅紙涓嶄緷璧?Google 鏈嶅姟锛?
  window.__startSpeechRecognition = async function(){
    try{ return await NativeAlarm.startSpeechRecognition(); }
    catch(e){
      const msg = (e && e.message) ? e.message : '璇煶璇嗗埆鍚姩澶辫触';
      return { errorCode: -1, message: msg };
    }
  };
  window.__stopSpeechRecognition = async function(){
    try{ return await NativeAlarm.stopSpeechRecognition(); }catch(e){ return {}; }
  };

  // 娉ㄥ唽鏈潵涓€缁勬湰鍦伴€氱煡銆傛瘡娆℃渶澶?30 鏉★紝瑕嗙洊 App 琚潃鍚庣殑閲嶅鎻愰啋銆?
  window.__scheduleNotif = async function(payload){
    try{
      await NativeAlarm.syncEvent({
        id: payload.id,
        name: payload.name,
        emoji: payload.emoji || '',
        voice: payload.voice || '鏍囧噯鎾姤',
        items: payload.items || []
      });
    }catch(e){ console.warn('schedule notif failed', e); }
  };

  // 鍙栨秷浜嬩欢鏈潵 30 鏉￠€氱煡
  window.__cancelNotif = async function(evId){
    try{
      await NativeAlarm.cancelEvent({ id: evId });
    }catch(e){}
  };

  // 鍙栬蛋鍘熺敓渚ц褰曠殑鐢ㄦ埛鍔ㄤ綔锛堝湪閫氱煡/寮圭獥涓婄偣鐨勨€滃畬鎴愨€濄€佸凡瑙﹀彂璁板綍锛?
  window.__consumeNativeActions = async function(){
    try{ return await NativeAlarm.consumeNativeActions(); }
    catch(e){ return { done: {}, fired: {} }; }
  };

  function hashId(str){
    let h = 0;
    for(let i = 0; i < str.length; i++){ h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h) % 2147483647;
  }

  // App 鍚姩/浠庨€氱煡鐐瑰嚮杩涘叆鏃惰姹傛潈闄?
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => window.__requestNotifPerm());
  } else {
    window.__requestNotifPerm();
  }
})();
</script>
`;

// 娉ㄥ叆鍒颁富鑴氭湰涔嬪墠锛堟ā鍧楀寲鍚庝互绗竴涓?<script src> 涓洪敋鐐癸級
html = html.replace('<script src="app/core.js">', bridge + '\n<script src="app/core.js">');

// 鍐欏叆 www/index.html锛堝叧閿楠わ級
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(out, html);

// 鍚屾澶嶅埗妯″潡璧勬簮锛坰tyles.css 涓?app/*.js锛?
fs.rmSync(path.join(dist, 'app'), { recursive: true, force: true });
fs.cpSync(path.join(__dirname, 'app'), path.join(dist, 'app'), { recursive: true });
if(fs.existsSync(path.join(__dirname, 'privacy.html'))) fs.cpSync(path.join(__dirname, 'privacy.html'), path.join(dist, 'privacy.html'));
console.log('www/ 宸茬敓鎴愶細index.html ' + (html.length / 1024).toFixed(1) + ' KB + app/ 妯″潡璧勬簮');

