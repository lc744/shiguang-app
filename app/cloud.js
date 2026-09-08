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

  function authHeaders(extra){
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if(__session && __session.access) h['Authorization'] = 'Bearer ' + __session.access;
    return h;
  }

  async function authFetch(path, opts){
    opts = opts || {};
    const url = AUTH_BASE + path + '?client_id=' + CLOUD_ENV;
    const resp = await fetch(url, {
      method: opts.method || 'POST',
      headers: authHeaders(opts.headers),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let j = null;
    try{ j = await resp.json(); }catch(e){ j = {}; }
    if(!resp.ok){
      const err = new Error(j.error_description || j.error || ('HTTP ' + resp.status));
      err.payload = j;
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

  async function refreshSession(){
    if(!__session || !__session.refresh) return false;
    try{
      const j = await authFetch('/token', { body: { grant_type: 'refresh_token', refresh_token: __session.refresh } });
      if(j.access_token){
        __session.access = j.access_token;
        __session.refresh = j.refresh_token || __session.refresh;
        __session.expiresAt = Date.now() + ((j.expires_in || 3600) * 1000) - 60000;
        saveSession();
        return true;
      }
      return false;
    }catch(e){ return false; }
  }

  async function ensureFreshToken(){
    if(!__session) return false;
    if(__session.expiresAt && Date.now() < __session.expiresAt) return true;
    return refreshSession();
  }

  // ---------- 资料：认证系统自带用户档案（无需数据库/函数） ----------
  // auth 字段: name(昵称) / gender(MALE|FEMALE) / birthdate(YYYY-MM-DD)
  function profileFromMe(me){
    if(!me) return null;
    return {
      nickname: me.name || '',
      gender: me.gender ? String(me.gender).toLowerCase() : '',
      birth: me.birthdate ? String(me.birthdate).slice(0, 7) : '',
      avatar: null, // 头像暂存本机（auth 档案不持久化 avatar_url）
      email: me.email || '',
    };
  }

  async function loadProfile(uid){
    try{
      await ensureFreshToken();
      const me = await authFetch('/user/me', { method: 'GET' });
      return profileFromMe(me) || {};
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
      if(!Object.keys(body).length) return true;
      await authFetch('/user/profile', { method: 'PATCH', body });
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
      clearSession();
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

  window.CloudAuth = {
    ENV: CLOUD_ENV,
    init, probe,
    get ready(){ return __probeDone; },
    active(){ return __active && enabled(); },
    setEnabled,
    enabled,
    sendRegisterCode,
    completeRegister,
    login,
    logout,
    currentUser,
    loadProfile,
    saveProfile,
    // 兼容旧接口（注册改为两步式后由 profile.js 直接调用上面两个）
    register: sendRegisterCode,
  };

  // 云同步开关（设置弹层的 cloudChips 使用）
  window.setCloudMode = function(v){
    setEnabled(!!v);
    location.reload();
  };
})();
