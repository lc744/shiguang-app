// 绸缪 · 腾讯云开发(TCB)云接入层
// 云可用 → 真实账号体系（邮箱+密码注册，验证邮件，资料/头像上云跨设备同步）
// 云不可用/未配置 → 自动回退本机演示模式（profile.js 原有行为），不破坏任何现有功能
(function(){
  'use strict';
  const CLOUD_ENV = 'gerenceshi-d0gguq5u39b4b86b2';
  const CLOUD_REGION = 'ap-shanghai';
  const CLOUD_SDK_URL = 'app/vendor/cloudbase.full.js';
  const USERS_COL = 'users';
  const MODE_KEY = 'shiguang_cloud_mode';   // 'off' = 强制本机模式（设置里可切回）

  let __app = null, __auth = null, __db = null;
  let __active = false;          // 云模式是否真正可用（SDK 加载 + init 成功）
  let __readyResolve = null;
  const __ready = new Promise(r => { __readyResolve = r; });

  function enabled(){ try{ return localStorage.getItem(MODE_KEY) !== 'off'; }catch(e){ return true; } }
  function setEnabled(v){ try{ localStorage.setItem(MODE_KEY, v ? 'on' : 'off'); }catch(e){} }

  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('SDK 加载失败'));
      document.head.appendChild(s);
    });
  }

  // 把 TCB 错误翻译成人话
  function friendly(e){
    const code = String((e && e.code) || '');
    const msg = String((e && e.message) || e || '');
    if(/EMAIL_EXISTS|ALREADY_EXIST/i.test(code + msg)) return '该邮箱已注册，请直接登录';
    if(/USER_NOT_FOUND|NOT_FOUND/i.test(code + msg)) return '该邮箱尚未注册';
    if(/PASSWORD_MISMATCH|INVALID_PASSWORD|WRONG/i.test(code + msg)) return '密码不正确';
    if(/UNAUTHORIZED|DOMAIN|FORBIDDEN/i.test(code + msg)) return '云服务未就绪（域名待配置）';
    if(/PARAM_INVALID|INVALID_PARAM/i.test(code + msg)) return '输入格式不正确';
    if(/网络|network|timeout|fetch/i.test(msg)) return '网络异常，请稍后再试';
    return msg.slice(0, 60) || '操作失败，请稍后再试';
  }

  async function init(){
    if(!enabled()) { __readyResolve(false); return false; }
    try{
      if(!window.cloudbase) await loadScript(CLOUD_SDK_URL);
      if(!window.cloudbase) throw new Error('SDK 加载失败');
      __app = cloudbase.init({ env: CLOUD_ENV, region: CLOUD_REGION });
      __auth = __app.auth({ persistence: 'local' });
      __db = __app.database();
      // 管道自愈探测：SDK 能加载 ≠ 云端接受本站请求（需套餐支持 + 安全域名已配置）。
      // 用一次哑凭登录试探：域名/套餐问题会报 UNAUTHORIZED 类错误；管道已通则报"用户不存在/密码错误"。
      // 结果缓存到 sessionStorage（同一浏览器会话只探一次）。
      let ok = false;
      try{ ok = sessionStorage.getItem('shiguang_cloud_probe') === '1'; }catch(e){}
      if(!ok){
        // 已有真实会话（本地持久化登录）→ 不做哑凭试探，避免顶掉用户会话
        try{
          const r = await __auth.getUser();
          ok = !!(r && r.user && r.user.uid);
        }catch(e){ ok = false; }
      }
      if(!ok){
        try{
          await __auth.signIn({ email: 'probe@shiguang.invalid', password: 'shiguang-probe-000' });
          ok = true;
        }catch(e){
          const sig = String((e && e.code) || '') + String((e && e.message) || '');
          ok = /USER_NOT_FOUND|PASSWORD_MISMATCH|INVALID_PASSWORD|ACCOUNT_NOT_EXIST|EMAIL_NOT_VERIF|GetAccountUser/i.test(sig);
        }
        try{ sessionStorage.setItem('shiguang_cloud_probe', ok ? '1' : '0'); }catch(e){}
      }
      __active = ok;
      __readyResolve(ok);
      return ok;
    }catch(e){
      console.warn('[cloud] 初始化失败，使用本机模式:', e && e.message);
      __active = false;
      __readyResolve(false);
      return false;
    }
  }

  async function currentUser(){
    if(!__active) return null;
    try{
      const r = await __auth.getUser();
      return (r && r.user) ? r.user : null;
    }catch(e){ return null; }
  }

  async function register(email, password){
    if(!__active) throw new Error('云服务不可用');
    try{ await __auth.signUp({ email, password }); }
    catch(e){ throw new Error(friendly(e)); }
    // 注册成功后验证邮件由云端自动发出
    return { ok: true, needVerify: true };
  }

  async function login(email, password){
    if(!__active) throw new Error('云服务不可用');
    try{
      const loginState = await __auth.signIn({ email, password });
      if(!loginState || !loginState.user) throw new Error('登录失败');
      const uid = loginState.user.uid;
      const profile = await loadProfile(uid);
      return {
        uid, email: loginState.user.email || email,
        profile: profile || {},
      };
    }catch(e){
      if(e && e.__friendly) throw e;
      throw Object.assign(new Error(friendly(e)), { __friendly: true });
    }
  }

  async function logout(){
    if(!__active) return;
    try{ await __auth.signOut(); }catch(e){}
  }

  async function loadProfile(uid){
    if(!__active) return null;
    try{
      const r = await __db.collection(USERS_COL).doc(uid).get();
      const doc = r && r.data ? (Array.isArray(r.data) ? r.data[0] : r.data) : null;
      return doc || null;
    }catch(e){ return null; }   // 无资料/集合未建 → 当作空资料
  }

  async function saveProfile(uid, patch){
    if(!__active) return false;
    try{
      const col = __db.collection(USERS_COL);
      const cur = await col.doc(uid).get();
      const exists = cur && cur.data && (Array.isArray(cur.data) ? cur.data.length > 0 : true);
      const payload = Object.assign({}, patch, { uid, updatedAt: Date.now() });
      if(exists) await col.doc(uid).update(payload);
      else await col.doc(uid).set(Object.assign({ createdAt: Date.now() }, payload));
      return true;
    }catch(e){
      console.warn('[cloud] 资料保存失败:', e && e.message);
      throw new Error(friendly(e));
    }
  }

  window.CloudAuth = {
    ready: __ready,
    active: () => __active && enabled(),
    init, register, login, logout, currentUser, loadProfile, saveProfile,
    setEnabled, enabled,
    ENV: CLOUD_ENV,
  };
  // 设置面板的「云同步 / 仅本机」开关（切换后重载，保证状态干净）
  window.setCloudMode = v => { setEnabled(v); location.reload(); };
  function syncChipUI(){
    const box = document.getElementById('cloudChips');
    if(!box) return;
    box.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', (c.dataset.cloud === 'on') === enabled()));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncChipUI);
  else setTimeout(syncChipUI, 0);
})();
