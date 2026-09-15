// 绸缪 · 云接入层（REST 直连腾讯云开发生认证网关：认证+资料档案一体）
// - 注册：邮箱+密码 → 发送验证码到邮箱 → 提交验证码完成注册（自动登录）
// - 登录：邮箱+密码 → token 会话（本地持久化，自动续期）
// - 资料：认证系统自带用户档案（昵称/性别/生日真云同步；头像暂存本机）
// - 未配置/网络不可达时自动降级本机演示模式
(function(){
  'use strict';

  const CLOUD_ENV = 'gerenceshi-d0gguq5u39b4b86b2';
  const CLOUD_REGION = 'ap-shanghai';
  const AUTH_BASE = 'https://' + CLOUD_ENV + '.api.tcloudbasegateway.com/auth/v1';
  const PROFILE_URL = 'https://' + CLOUD_ENV + '-1479056464.tcloudbaseapp.com/profileApi';
  const SESSION_KEY = 'shiguang_cloud_session';
  const MODE_KEY = 'shiguang_cloud_mode';

  let __active = false;
  let __session = null;      // { access, refresh, expiresAt, sub, email }
  let __probeDone = false;

  function enabled(){ try{ return localStorage.getItem(MODE_KEY) !== 'off'; }catch(e){ return true; } }
  function setEnabled(v){ try{ localStorage.setItem(MODE_KEY, v ? 'on' : 'off'); }catch(e){} }

  function friendly(e){
    const msg = String((e && e.error_description) || e && e.message || e || '');
    if(/verification_token or verification_code|verification_code required/i.test(msg)) return '请输入邮件中的验证码';
    if(/INVALID_USERNAME_OR_PASSWORD|用户名或密码/.test(msg)) return '邮箱或密码不正确';
    if(/USER_ALREADY_EXIST|already exist|已存在/i.test(msg)) return '该邮箱已注册，请直接登录';
    if(/INVALID_VERIFICATION_CODE|invalid_verification_code|验证码/.test(msg)) return '验证码不正确或已过期';
    if(/USER_NOT_FOUND|不存在/.test(msg)) return '该邮箱尚未注册，请先注册';
    if(/EMAIL_NOT_VERIFIED|not verified/i.test(msg)) return '邮箱尚未验证';
    if(/TOO_MANY|rate limit|EXHAUSTED/i.test(msg)) return '操作过于频繁，请稍后再试';
    if(/WEAK_PASSWORD|密码/.test(msg)) return '密码需至少 8 位，含字母和数字';
    if(/network|Failed to fetch|ERR_/i.test(msg)) return '网络不可达，云服务未就绪';
    return msg.slice(0, 90) || '操作失败，请稍后再试';
  }

  function authHeaders(extra, skipAuth){
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if(!skipAuth && __session && __session.access) h['Authorization'] = 'Bearer ' + __session.access;
    return h;
  }

  async function authFetch(path, opts){
    opts = opts || {};
    const url = AUTH_BASE + path + '?client_id=' + CLOUD_ENV;
    const resp = await fetch(url, {
      method: opts.method || 'POST',
      headers: authHeaders(opts.headers, opts.noAuth),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let j = null;
    try{ j = await resp.json(); }catch(e){ j = {}; }
    if(!resp.ok){
      const err = new Error(j.error_description || j.error || ('HTTP ' + resp.status));
      err.payload = j;
      err.__status = resp.status;   // 明确的 HTTP 拒绝（网络异常则无此标记）
      throw err;
    }
    return j;
  }

  // ---------- 会话持久化 ----------
  function saveSession(){ try{ localStorage.setItem(SESSION_KEY, JSON.stringify(__session)); }catch(e){} }
  function clearSession(){
    __session = null;
    try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
  }
  function loadStoredSession(){
    try{
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if(s && s.access && s.refresh) return s;
    }catch(e){}
    return null;
  }

  let __refreshDead = false; // refresh_token 被网关明确拒绝（会话真死）；网络失败不置位
  let __refreshing = null;   // 单飞：并发请求共享同一次刷新（refresh_token 是一次性轮换，并发刷必撞车）

  async function refreshSession(){
    if(__refreshing) return __refreshing;
    __refreshing = (async () => {
      // 微信自签会话：refresh 走 profileApi wxRefresh
      if(__session && __session.wx){
        try{
          const j = await profileApiCall('wxRefresh', { refresh_token: __session.refresh });
          __session.access = j.access_token;
          __session.refresh = j.refresh_token || __session.refresh;
          __session.expiresAt = Date.now() + ((j.expires_in || 7200) * 1000) - 60000;
          saveSession();
          __refreshDead = false;
          return true;
        }catch(e){
          __refreshDead = true;
          return false;
        }
      }
      if(!__session || !__session.refresh) return false;
      const tryOnce = async () => {
        try{
          // token 刷新是匿名端点：不能带当前（可能已过期的）Bearer，否则网关先拒 Bearer 导致有效 refresh 也失败
          const j = await authFetch('/token', { noAuth: true, body: { grant_type: 'refresh_token', refresh_token: __session.refresh } });
          if(j.access_token){
            __session.access = j.access_token;
            __session.refresh = j.refresh_token || __session.refresh;
            __session.expiresAt = Date.now() + ((j.expires_in || 3600) * 1000) - 60000;
            saveSession();
            __refreshDead = false;
            return true;
          }
          __refreshDead = true;   // 网关明确拒绝：会话真死
          return false;
        }catch(e){
          // 网关对"refresh_token 无效/过期"的拒绝：4xx，或 5xx+invalid token 文案（实测 500 unknown invalid token header）
          const msg = String((e && e.error_description) || (e && e.message) || '');
          if(e && e.__status && ((e.__status >= 400 && e.__status < 500) || /invalid\s*token/i.test(msg))){
            __refreshDead = true;
            return false;
          }
          return false;           // 网络类失败：不判死
        }
      };
      const first = await tryOnce();
      if(first || __refreshDead) return first;
      // 网络抖动（回前台瞬间常见）：小退避后重试一次
      await new Promise(r => setTimeout(r, 1200));
      return tryOnce();
    })();
    try{ return await __refreshing; } finally { __refreshing = null; }
  }

  async function ensureFreshToken(){
    if(!__session) return false;
    if(__session.expiresAt && Date.now() < __session.expiresAt) return true;
    return refreshSession();
  }

  // ---------- 微信登录（绑定码 + 轮询，自签会话） ----------
  async function wxLoginCreate(){
    if(!__active) throw new Error('云服务不可用');
    try{ return await profileApiCall('wxLoginCreate', {}); }
    catch(e){ throw new Error(friendly(e)); }
  }
  async function wxLoginPoll(loginId){
    if(!__active) throw new Error('云服务不可用');
    try{ return await profileApiCall('wxLoginPoll', { loginId }); }
    catch(e){ throw new Error(friendly(e)); }
  }
  function isWxSession(){ return !!(__session && __session.wx); }
  function wxApplySession(sess){
    __session = {
      access: sess.access_token, refresh: sess.refresh_token,
      expiresAt: Date.now() + ((sess.expires_in || 7200) * 1000) - 60000,
      sub: sess.uid || sess.sub || '', email: '', wx: true,
    };
    saveSession();
    return __session;
  }

  // ---------- 头像：经 profileApi 云函数（函数未部署时静默降级为本机头像） ----------
  function profileApiAvailable(){ return !!PROFILE_URL; }

  async function profileApiCall(action, data, allowAnonymous){
    if(!allowAnonymous && !__session) throw new Error('未登录');
    if(allowAnonymous){
      // 匿名调用（如公共信息流）：有会话则带上，无会话直接发
      await ensureFreshToken().catch(() => {});
    }else{
      await ensureFreshToken();
    }
    const doFetch = () => fetch(PROFILE_URL, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, __session ? { 'Authorization': 'Bearer ' + __session.access } : {}),
      body: JSON.stringify(data ? Object.assign({ action }, data) : { action }),
    });
    let resp = await doFetch();
    // 网关侧提前判过期（时钟偏差等）：强刷一次再重试，避免一枪毙命
    if(resp.status === 401 && __session && __session.refresh){
      if(await refreshSession()) resp = await doFetch();
    }
    const j = await resp.json().catch(() => ({}));
    if(!resp.ok || j.error) throw new Error(j.error || ('HTTP ' + resp.status));
    return j;
  }

  // ---------- 资料：认证系统自带用户档案（无需数据库/函数） ----------
  // auth 字段: name(昵称) / gender(MALE|FEMALE) / birthdate(YYYY-MM-DD)；头像走 profileApi
  function profileFromMe(me){
    if(!me) return null;
    return {
      nickname: me.name || '',
      gender: me.gender ? String(me.gender).toLowerCase() : '',
      birth: me.birthdate ? String(me.birthdate).slice(0, 7) : '',
      avatar: null, // 头像由 loadProfile 从 profileApi 合并（不可用时保持 null）
      email: me.email || '',
    };
  }

  async function loadProfile(uid){
    try{
      await ensureFreshToken();
      const me = await authFetch('/user/me', { method: 'GET' });
      const base = profileFromMe(me) || {};
      // 头像云同步：profileApi 可用则合并；不可用静默跳过
      try{
        const r = await profileApiCall('get');
        if(r && r.profile && typeof r.profile.avatar === 'string') base.avatar = r.profile.avatar;
      }catch(e2){ /* 函数未部署/未开通数据库 → 本机头像 */ }
      return base;
    }catch(e){
      console.warn('[cloud] 资料读取失败:', e.message);
      return {};
    }
  }

  async function saveProfile(uid, patch){
    try{
      await ensureFreshToken();
      const body = {};
      const p = patch || {};
      if(typeof p.nickname === 'string' && p.nickname) body.name = p.nickname.slice(0, 40);
      if(p.gender === 'male') body.gender = 'MALE';
      else if(p.gender === 'female') body.gender = 'FEMALE';
      if(typeof p.birth === 'string' && /^\d{4}-\d{2}$/.test(p.birth)) body.birthdate = p.birth + '-01';
      if(Object.keys(body).length) await authFetch('/user/profile', { method: 'PATCH', body });
      // 头像云同步（失败提示用户，发布时会自动补传）
      if(typeof p.avatar === 'string'){
        try{ await profileApiCall('save', { avatar: p.avatar.slice(0, 400000) }); }
        catch(e2){ console.warn('[cloud] 头像云同步暂不可用:', e2.message); try{ toast('头像暂未同步云端，下次发布会自动补传'); }catch(e3){} }
      }
      return true;
    }catch(e){
      console.warn('[cloud] 资料保存失败:', e.message);
      return false;
    }
  }

  // ---------- 对外接口 ----------
  async function currentUser(){
    if(!__active || !__session) return null;
    try{
      await ensureFreshToken();
      const me = await authFetch('/user/me', { method: 'GET' });
      if(me && me.sub){
        __session.sub = me.sub;
        __session.email = me.email || __session.email;
        saveSession();
        return { uid: me.sub, email: me.email || __session.email };
      }
      return null;
    }catch(e){
      // 尝试刷新一次
      if(await refreshSession()){
        try{
          const me = await authFetch('/user/me', { method: 'GET' });
          if(me && me.sub) return { uid: me.sub, email: me.email || __session.email };
        }catch(e2){}
      }
      // 只有会话被网关"明确拒绝"才清会话；网络抖动时保留，避免误杀有效登录态
      if(__refreshDead || (e && e.__status === 401)){
        clearSession();
      }
      return null;
    }
  }

  // 第一步：发送验证码（注册模式）
  async function sendRegisterCode(email){
    if(!__active) throw new Error('云服务不可用');
    try{
      await authFetch('/verification', { body: { email, usage: 'email', target: 'ANY' } });
      return { ok: true };
    }catch(e){ throw new Error(friendly(e)); }
  }

  // ---------- 手机号登录（短信验证码注册 + 密码登录） ----------
  function normalizePhone(p){
    const d = String(p || '').replace(/\D/g, '');
    if(!/^1[3-9]\d{9}$/.test(d)) return null;
    return '+86 ' + d;
  }
  async function sendPhoneCode(phone){
    if(!__active) throw new Error('云服务不可用');
    const full = normalizePhone(phone);
    if(!full) throw new Error('请输入有效的 11 位手机号');
    try{
      await authFetch('/verification', { body: { phone_number: full, usage: 'phone' } });
      return { ok: true };
    }catch(e){
      const msg = String(e && e.error_description || e.message || '');
      if(/per minute/.test(msg)) throw new Error('发送太频繁，请 1 分钟后再试');
      throw new Error(friendly(e));
    }
  }
  async function phoneRegister(phone, code, password){
    if(!__active) throw new Error('云服务不可用');
    const full = normalizePhone(phone);
    if(!full) throw new Error('请输入有效的 11 位手机号');
    if(!code) throw new Error('请输入短信验证码');
    if(!password || password.length < 6) throw new Error('密码至少 6 位');
    try{
      const j = await authFetch('/signup', { body: { phone_number: full, verification_code: code, password } });
      if(j && j.access_token){
        __session = {
          access: j.access_token, refresh: j.refresh_token,
          expiresAt: Date.now() + ((j.expires_in || 3600) * 1000) - 60000,
          sub: j.sub || '', email: '', phone: full,
        };
        saveSession();
      }
      return { ok: true, uid: j.sub || '', phone: full, signedIn: !!(j && j.access_token) };
    }catch(e){
      const msg = String(e && e.error_description || e.message || '');
      if(/already_exists/.test(msg)) throw new Error('该手机号已注册，请用密码登录');
      if(/verification|code/i.test(msg) && /invalid|错误/.test(msg)) throw new Error('验证码错误或已过期');
      throw new Error(friendly(e));
    }
  }
  async function phoneLogin(phone, password){
    if(!__active) throw new Error('云服务不可用');
    const full = normalizePhone(phone);
    if(!full) throw new Error('请输入有效的 11 位手机号');
    if(!password) throw new Error('请输入密码');
    try{
      const j = await authFetch('/signin', { body: { username: full, password } });
      __session = {
        access: j.access_token, refresh: j.refresh_token,
        expiresAt: Date.now() + ((j.expires_in || 3600) * 1000) - 60000,
        sub: j.sub || '', email: j.email || '', phone: full,
      };
      saveSession();
      return { ok: true, uid: j.sub || '', email: j.email || '', phone: full };
    }catch(e){
      const msg = String(e && e.error_description || e.message || '');
      if(/password_not_set|PASSWORD_NOT_SET/i.test(msg)) throw new Error('该手机号未设置密码，请用验证码注册');
      if(/invalid|密码错误/i.test(msg)) throw new Error('手机号或密码错误');
      throw new Error(friendly(e));
    }
  }

  // 第二步：凭验证码完成注册（成功即返回会话）
  async function completeRegister(email, password, code){
    if(!__active) throw new Error('云服务不可用');
    try{
      const j = await authFetch('/signup', { body: { email, password, verification_code: code } });
      if(j && j.access_token){
        __session = {
          access: j.access_token, refresh: j.refresh_token,
          expiresAt: Date.now() + ((j.expires_in || 3600) * 1000) - 60000,
          sub: j.sub || '', email,
        };
        saveSession();
      }
      return { ok: true, signedIn: !!(j && j.access_token) };
    }catch(e){ throw new Error(friendly(e)); }
  }

  async function login(email, password){
    if(!__active) throw new Error('云服务不可用');
    try{
      const j = await authFetch('/signin', { body: { username: email, password } });
      __session = {
        access: j.access_token, refresh: j.refresh_token,
        expiresAt: Date.now() + ((j.expires_in || 3600) * 1000) - 60000,
        sub: j.sub || '', email,
      };
      saveSession();
      const u = await currentUser();
      if(!u) throw new Error('登录失败');
      const profile = await loadProfile(u.uid);
      return { uid: u.uid, email: u.email, profile: profile || {} };
    }catch(e){
      if(e.__friendly) throw e;
      throw Object.assign(new Error(friendly(e)), { __friendly: true });
    }
  }

  async function logout(){
    try{ if(__session) await authFetch('/user/signout', { body: {} }); }catch(e){}
    clearSession();
    return true;
  }

  // ---------- 管道探测 ----------
  async function probe(){
    // 已有会话 → 直接视为可用
    const stored = loadStoredSession();
    if(stored){
      __session = stored;
      return true;
    }
    // 轻量探测：非法格式邮箱 → 必然业务错误(4xx)，绝不真正发信；网络/CORS 故障则抛 TypeError
    try{
      const resp = await fetch(AUTH_BASE + '/verification?client_id=' + CLOUD_ENV, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'probe', usage: 'email' }),
      });
      // 管道通：任意业务响应（4xx 业务码也算通）
      return resp.status < 500 && resp.status !== 0;
    }catch(e){
      return false;
    }
  }

  async function init(){
    if(!enabled()){ __active = false; __probeDone = true; return false; }
    try{
      __active = await probe();
    }catch(e){ __active = false; }
    __probeDone = true;
    return __active;
  }

  // ---------- 会话保鲜：回前台立即续期 + 前台每 5 分钟静默续期 ----------
  function hasLocalSession(){ return !!(loadStoredSession() && !__refreshDead); }

  // ---------- 在线心跳：前台时上报 last_seen，供管理员查看用户在线情况 ----------
  function currentNickname(){
    try{ const u = JSON.parse(localStorage.getItem('shiguang_user') || 'null'); return (u && u.nickname) || ''; }catch(e){ return ''; }
  }
  async function heartbeat(){
    if(!(__session && __active && document.visibilityState === 'visible')) return;
    try{ await profileApiCall('heartbeat', { nickname: currentNickname() }); }catch(e){}
  }

  if(typeof document !== 'undefined' && document.addEventListener){
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible' && __session && __active){
        ensureFreshToken().catch(() => {});
        heartbeat();
      }
    });
  }
  if(typeof setInterval === 'function'){
    setInterval(() => {
      if(__session && __active && document.visibilityState === 'visible'){
        ensureFreshToken().catch(() => {});
        heartbeat();
      }
    }, 5 * 60 * 1000);
  }

  window.CloudAuth = {
    ENV: CLOUD_ENV,
    init, probe,
    get ready(){ return __probeDone; },
    active(){ return __active && enabled(); },
    setEnabled,
    enabled,
    hasLocalSession,
    sendRegisterCode,
    completeRegister,
    login,
    logout,
    sendPhoneCode,
    phoneRegister,
    phoneLogin,
    wxLoginCreate,
    wxLoginPoll,
    wxApplySession,
    isWxSession,
    currentUser,
    loadProfile,
    saveProfile,
    _profileApiCall: profileApiCall,
    _profileApiUrl: PROFILE_URL,
    // 兼容旧接口（注册改为两步式后由 profile.js 直接调用上面两个）
    register: sendRegisterCode,
  };

  // 云同步开关（设置弹层的 cloudChips 使用）
  window.setCloudMode = function(v){
    setEnabled(!!v);
    location.reload();
  };
})();
