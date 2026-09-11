// 绸缪 · 我的页（用户登录、头像上传、昵称修改）
// 当前可用：邮箱注册/登录（邮箱+密码，无需备案资质）。
// 保留未启用：手机号短信登录、微信授权登录 —— 短信签名与网页授权均需 ICP 备案/开放平台资质，
// 代码完整保留，待资质具备后在 index.html 登录面板恢复入口即可。
// 账号数据保存在本机（localStorage + IndexedDB），接入后端后只需替换 do*Login 入口为服务端请求。
/* ---------------- 用户状态 ---------------- */
const USER_KEY = 'shiguang_user';
const REGISTRY_KEY = 'shiguang_user_registry';   // 模拟服务端账户表（邮箱/手机号/openId → 账号资料）
let currentUser = null;

function loadUser(){
  try{ currentUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }catch(e){ currentUser = null; }
  if(!currentUser || typeof currentUser !== 'object' || !currentUser.id) currentUser = null;
}
function persistUser(){
  try{ localStorage.setItem(USER_KEY, JSON.stringify(currentUser)); }catch(e){ toast('用户信息保存失败'); }
}
function loadRegistry(){
  try{ const r = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}'); return (r && typeof r === 'object') ? r : {}; }
  catch(e){ return {}; }
}
function saveRegistry(reg){ try{ localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg)); }catch(e){} }
// 把当前会话用户资料同步进"账户表"（昵称/头像改动退出登录后仍保留）
function saveAccountToRegistry(){
  if(!currentUser || !currentUser.id) return;
  const reg = loadRegistry();
  reg[currentUser.id] = {
    id: currentUser.id, type: currentUser.type, phone: currentUser.phone || '',
    email: currentUser.email || '', passHash: currentUser.passHash || '',
    gender: currentUser.gender || '', birth: currentUser.birth || '',
    nickname: currentUser.nickname, avatar: currentUser.avatar || null, createdAt: currentUser.createdAt
  };
  saveRegistry(reg);
}
function setCurrentUser(account){
  currentUser = Object.assign({}, account);
  persistUser();
  saveAccountToRegistry();
  renderUserCard();
}
function initProfile(){
  loadUser(); renderUserCard();
  if(window.CloudAuth){
    CloudAuth.init().then(() => restoreCloudSession());
  }
}
// 云端会话恢复：TCB 已登录用户 → 拉云端资料 → 渲染
async function restoreCloudSession(){
  if(!(window.CloudAuth && CloudAuth.active())) return;
  try{
    const u = await CloudAuth.currentUser();
    if(!u || !u.uid){
      // 云会话已失效但本机仍残留云账号记录 → 对齐为未登录，避免"假登录"状态
      if(currentUser && currentUser.cloud){
        currentUser = null;
        try{ localStorage.removeItem(USER_KEY); }catch(e){}
        renderUserCard();
      }
      return;
    }
    const p = (await CloudAuth.loadProfile(u.uid)) || {};
    if(!currentUser || currentUser.id !== u.uid){
      setCurrentUser({
        id: u.uid, type: 'email', email: u.email || p.email || '',
        nickname: p.nickname || (u.email || '用户').split('@')[0].slice(0, 12),
        gender: p.gender || '', birth: p.birth || '',
        avatar: p.avatar || null, createdAt: p.createdAt || new Date().toISOString(),
        cloud: true,
      });
    } else {
      // 同 id 本机资料已存在 → 云端资料合并补齐（头像/昵称/性别/生日）
      let changed = false;
      if(p.avatar && currentUser.avatar !== p.avatar){ currentUser.avatar = p.avatar; changed = true; }
      if(p.nickname && !currentUser.nickname){ currentUser.nickname = p.nickname; changed = true; }
      if(p.gender && !currentUser.gender){ currentUser.gender = p.gender; changed = true; }
      if(p.birth && !currentUser.birth){ currentUser.birth = p.birth; changed = true; }
      if(changed){ persistUser(); saveAccountToRegistry(); renderUserCard(); }
    }
  }catch(e){ console.warn('[cloud] 会话恢复失败:', e && e.message); }
  repairCloudAvatar();
}

/* ---- 头像云同步自愈：本地有头像而云端缺失时自动补传 ---- */
async function avatarDataUrl(){
  try{
    if(!currentUser || !currentUser.avatar) return null;
    const a = String(currentUser.avatar);
    if(a.indexOf('data:image/') === 0) return a;
    if(isAvatarRef(a)){
      const d = await mediaGet(a);
      return (d && String(d).indexOf('data:image/') === 0) ? d : null;
    }
    return null;
  }catch(e){ return null; }
}
async function repairCloudAvatar(){
  try{
    if(!(window.CloudAuth && currentUser && currentUser.cloud && currentUser.id)) return;
    if(!currentUser.avatar) return;
    const prof = await CloudAuth.loadProfile(currentUser.id).catch(() => null);
    if(prof && prof.avatar) return; // 云端已有头像，无需补传
    const d = await avatarDataUrl();
    if(d) syncCloudProfile({ avatar: d });
  }catch(e){}
}

/* ---------------- 我的页渲染（与小程序 me 页一致：账号卡 + 无框资料行 + 菜单卡） ---------------- */
function isAvatarRef(v){ return typeof v === 'string' && /^avatar:[A-Za-z0-9_\-]+$/.test(v); }
function maskPhone(phone){
  const p = String(phone || '');
  return p.length === 11 ? p.slice(0,3) + '****' + p.slice(7) : p;
}
function maskEmail(email){
  const e = String(email || '');
  const at = e.indexOf('@');
  if(at <= 0) return e;
  const name = e.slice(0, at), domain = e.slice(at);
  return name.slice(0, 2) + '***' + domain;
}
const GENDER_LABEL = { '': '未设置', male: '男', female: '女' };
function formatBirth(v){
  const m = String(v || '').match(/^(\d{4})-(\d{2})$/);
  return m ? m[1] + '年' + m[2] + '月' : '';
}
function accountTitle(){
  if(!currentUser) return '';
  if(currentUser.type === 'email') return currentUser.email || '';
  if(currentUser.type === 'phone') return maskPhone(currentUser.phone);
  return '微信用户';
}
let meEditing = false;
function renderUserCard(){ renderMeCard(); renderMeBody(); }

function renderMeCard(){
  const box = document.getElementById('meCard');
  if(!box) return;
  if(!currentUser){
    box.innerHTML = `
      <div class="card me-hero">
        <div class="me-hero-emoji">👋</div>
        <div class="me-hero-title">登录绸缪账号</div>
        <div class="me-hero-sub">登录后可以发布分享，资料与头像云端同步</div>
        <button class="primary me-login-btn" onclick="openLogin()">邮箱注册 / 登录</button>
        <div class="me-hero-note">微信 / 手机号登录待备案资质，暂未开放</div>
      </div>`;
    return;
  }
  const avatarInner = isAvatarRef(currentUser.avatar)
    ? '<img id="meAvatarImg" alt="头像" />'
    : (isDataUrl(currentUser.avatar) ? `<img class="me-avatar-img" src="${esc(currentUser.avatar)}" alt="头像" />` : '');
  if(meEditing){
    box.innerHTML = `
      <div class="card me-card">
        <div class="me-edit-row">
          <button class="avatar-btn" onclick="onAvatarClick()" title="点击更换头像">
            ${avatarInner ? `<span class="me-avatar me-avatar-lg">${avatarInner}</span>` : '<span class="me-avatar me-avatar-lg me-avatar-ph">📷<text>头像</text></span>'}
          </button>
          <input class="me-nick-input" id="meNickInput" placeholder="填写昵称" maxlength="12" value="${esc(currentUser.nickname || '')}" />
        </div>
        <div class="me-edit-tip">头像默认云同步，也可以换一张</div>
        <div class="me-btn-row">
          <button class="secondary me-btn" onclick="cancelMeEdit()">取消</button>
          <button class="primary me-btn" onclick="saveMeEdit()">保存</button>
        </div>
      </div>
      <input type="file" id="avatarFile" accept="image/*" style="display:none" onchange="onAvatarPicked(event)" />`;
    resolveAvatarImg();
    return;
  }
  box.innerHTML = `
    <div class="card me-card">
      <div class="me-view-row" onclick="startMeEdit()" role="button" title="点这里修改头像和昵称">
        <span class="me-avatar me-avatar-lg">${avatarInner || '<span class="me-avatar-ph-lg">👤</span>'}</span>
        <span class="me-view-info">
          <text class="me-nick">${esc(currentUser.nickname || '用户')}</text>
          <text class="me-view-sub">点这里修改头像和昵称</text>
        </span>
        <text class="me-arrow">›</text>
      </div>
    </div>
    <input type="file" id="avatarFile" accept="image/*" style="display:none" onchange="onAvatarPicked(event)" />`;
  resolveAvatarImg();
}
// 本机头像引用失效（IndexedDB 被清理等）→ 自动从云端拉回头像
function ensureCloudAvatar(){
  if(!(window.CloudAuth && currentUser && currentUser.cloud)) return;
  CloudAuth.loadProfile(currentUser.id).then(p => {
    if(p && typeof p.avatar === 'string' && p.avatar && currentUser){
      currentUser.avatar = p.avatar;
      persistUser();
      saveAccountToRegistry();
      renderUserCard();
      toast('已从云端同步头像');
    }
  }).catch(() => {});
}
function resolveAvatarImg(){
  if(!currentUser || !isAvatarRef(currentUser.avatar)) return;
  mediaGet(currentUser.avatar).then(data => {
    const img = document.getElementById('meAvatarImg');
    if(img && data){ img.src = data; }
    else { ensureCloudAvatar(); }
  }).catch(() => ensureCloudAvatar());
}
function startMeEdit(){ if(!currentUser){ openLogin(); return; } meEditing = true; renderMeCard(); }
function cancelMeEdit(){ meEditing = false; renderMeCard(); }
async function saveMeEdit(){
  if(!currentUser) return;
  const v = (document.getElementById('meNickInput').value || '').trim();
  if(!v){ toast('昵称不能为空'); return; }
  currentUser.nickname = v.slice(0, 12);
  persistUser();
  saveAccountToRegistry();
  syncCloudProfile({ nickname: currentUser.nickname });
  meEditing = false;
  renderUserCard();
  toast('资料已保存');
}

function renderMeBody(){
  const box = document.getElementById('meBody');
  if(!box) return;
  const logged = !!currentUser;
  const birth = logged ? formatBirth(currentUser.birth) : '';
  const emailText = logged ? (currentUser.type === 'email' ? esc(currentUser.email) : esc(accountTitle())) : '无';
  const genderText = logged ? (GENDER_LABEL[currentUser.gender] || '未设置') : '无';
  const birthText = logged ? (birth || '未设置') : '无';
  const unset = v => (!v || v === '无' || v === '未设置') ? 'info-unset' : '';
  const editHandler = logged ? 'openGenderEditor()' : 'requireLoginTip()';
  const birthHandler = logged ? 'openBirthEditor()' : 'requireLoginTip()';
  box.innerHTML = `
    <div class="card me-menu">
      <div class="me-item" title="${logged ? emailText : '登录后显示'}">
        <text class="me-item-emoji">📧</text><text class="me-item-label">邮箱</text>
        <text class="me-info-value ${unset(emailText)}">${emailText}</text>
      </div>
      <div class="me-item" onclick="${editHandler}" role="button">
        <text class="me-item-emoji">🚻</text><text class="me-item-label">性别</text>
        <text class="me-info-value ${unset(genderText)}">${esc(genderText)}</text>
        <text class="me-arrow">›</text>
      </div>
      <div class="me-item" onclick="${birthHandler}" role="button">
        <text class="me-item-emoji">🎂</text><text class="me-item-label">出生年月</text>
        <text class="me-info-value ${unset(birthText)}">${esc(birthText)}</text>
        <text class="me-arrow">›</text>
      </div>
      <div class="me-item" onclick="goMyPosts()" role="button">
        <text class="me-item-emoji">📮</text><text class="me-item-label">我的发布</text><text class="me-arrow">›</text>
      </div>
      <div class="me-item" onclick="openSettings()" role="button">
        <text class="me-item-emoji">⚙️</text><text class="me-item-label">设置</text><text class="me-arrow">›</text>
      </div>
      ${logged ? `<div class="me-item" onclick="logoutUser()" role="button">
        <text class="me-item-emoji">🚪</text><text class="me-item-label danger">退出登录</text><text class="me-arrow">›</text>
      </div>` : ''}
    </div>`;
}
function requireLoginTip(){ toast('请先登录'); }
function goMyPosts(){
  if(!currentUser){ toast('请先登录'); return; }
  try{ if(window.showShareTab) showShareTab('mine'); }catch(e){}
  try{ showPage('page-share', document.querySelector('.tab[data-target=page-share]')); }catch(e){}
}
let pickedGender = '';
function openGenderEditor(){
  if(!currentUser){ openLogin(); return; }
  pickedGender = currentUser.gender || '';
  document.querySelectorAll('#genderChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.gender === pickedGender));
  document.getElementById('genderOverlay').style.display = 'flex';
}
function openBirthEditor(){
  if(!currentUser){ openLogin(); return; }
  const inp = document.getElementById('birthInput');
  inp.value = currentUser.birth || '';
  document.getElementById('birthClearRow').style.display = currentUser.birth ? 'block' : 'none';
  document.getElementById('birthOverlay').style.display = 'flex';
}
function closeInfoEditor(){
  const g = document.getElementById('genderOverlay'); if(g) g.style.display = 'none';
  const b = document.getElementById('birthOverlay'); if(b) b.style.display = 'none';
}
function pickGender(g){
  pickedGender = g;
  document.querySelectorAll('#genderChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.gender === g));
}
function clearBirth(){
  document.getElementById('birthInput').value = '';
  document.getElementById('birthClearRow').style.display = 'none';
}
function saveGender(){
  if(!currentUser) return;
  currentUser.gender = pickedGender;
  persistUser();
  saveAccountToRegistry();
  syncCloudProfile({ gender: currentUser.gender });
  renderMeBody();
  closeInfoEditor();
  toast('性别已保存');
}
function saveBirth(){
  if(!currentUser) return;
  const birth = (document.getElementById('birthInput').value || '').trim();
  if(birth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(birth)){ toast('出生年月格式不正确'); return; }
  currentUser.birth = birth;
  persistUser();
  saveAccountToRegistry();
  syncCloudProfile({ birth: currentUser.birth });
  renderMeBody();
  closeInfoEditor();
  toast('出生年月已保存');
}

/* ---------------- 设置入口（按钮 → 弹层） ---------------- */
function openSettings(){ document.getElementById('settingsOverlay').style.display = 'flex'; }
function closeSettings(){ document.getElementById('settingsOverlay').style.display = 'none'; }
function onAvatarClick(){
  if(!currentUser){ openLogin(); return; }
  const input = document.getElementById('avatarFile');
  if(input) input.click();
}

/* ---------------- 头像上传（压缩到 256px JPEG） ---------------- */
function compressImageFile(file, maxSize){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try{
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        }catch(e){ reject(e); }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function onAvatarPicked(ev){
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if(!file) return;
  if(!currentUser){ toast('请先登录'); return; }
  if(!file.type.startsWith('image/')){ toast('请选择图片文件'); return; }
  try{
    const dataUrl = await compressImageFile(file, 256);
    // 旧头像引用的大对象先删掉，避免 IndexedDB 残留
    if(isAvatarRef(currentUser.avatar)) mediaDel(currentUser.avatar);
    let ref = currentUser.avatar;
    if(await mediaProbe()){
      if(!isAvatarRef(ref)) ref = 'avatar:' + uid();
      await mediaPut(ref, dataUrl);
    }else{
      ref = dataUrl; // 降级：IndexedDB 不可用时内联存储（压缩后体积很小）
    }
    currentUser.avatar = ref;
    persistUser();
    saveAccountToRegistry();
    syncCloudProfile({ avatar: dataUrl });   // 云模式：头像 dataURL 直接上云（压缩后 ≤60KB）
    renderUserCard();
    toast('头像已更新');
  }catch(e){ toast('头像上传失败，请换一张图片试试'); }
}

/* ---------------- 登录 / 注册（演示模式） ---------------- */
let smsSession = { phone: '', code: '', expireAt: 0 };
let codeCountdown = 0, codeTimer = null;

function openLogin(){
  showLoginHome();
  const hint = document.getElementById('loginModeHint');
  if(hint){
    hint.textContent = (window.CloudAuth && CloudAuth.active())
      ? '云端账号模式：真实邮箱注册，验证码确认，资料与头像云同步'
      : '演示模式：账号保存在本机；云服务就绪后自动切换云端账号';
  }
  document.getElementById('loginOverlay').style.display = 'flex';
}
function closeLogin(){
  document.getElementById('loginOverlay').style.display = 'none';
  // 登录弹层关闭时若正处在分享页：已登录 → 立即加载列表（无缝可见）；未登录 → 回到"我的"页
  try{
    const active = document.querySelector('.page.active');
    if(active && active.id === 'page-share'){
      if(currentUser && typeof loadShare === 'function'){
        shareLoadedOnce = true;
        loadShare(true);
      } else {
        const tab = document.querySelector('.tab[data-target=page-profile]');
        if(tab && typeof showPage === 'function') showPage('page-profile', tab);
      }
    }
  }catch(e){}
}
function loginPanel(which){
  document.getElementById('loginHome').style.display = which === 'home' ? 'block' : 'none';
  document.getElementById('loginPhone').style.display = which === 'phone' ? 'block' : 'none';
  document.getElementById('loginWechat').style.display = which === 'wechat' ? 'block' : 'none';
  document.getElementById('loginEmail').style.display = which === 'email' ? 'block' : 'none';
}
function showLoginHome(){ loginPanel('home'); }
function showEmailLogin(){
  loginPanel('email');
  setEmailMode('login');
  document.getElementById('loginEmailInput').value = '';
  document.getElementById('loginPassInput').value = '';
  document.getElementById('loginPass2Input').value = '';
}
function showPhoneLogin(){
  loginPanel('phone');
  document.getElementById('loginPhoneInput').value = (currentUser && currentUser.type === 'phone') ? currentUser.phone : '';
  document.getElementById('loginCodeInput').value = '';
}
function showWechatLogin(){ loginPanel('wechat'); }

/* ---- 手机号 + 验证码（需短信备案，暂未开放；代码保留待启用） ---- */
function sendLoginCode(){
  const phone = (document.getElementById('loginPhoneInput').value || '').trim();
  if(!/^1\d{10}$/.test(phone)){ toast('请输入正确的 11 位手机号'); return; }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  smsSession = { phone, code, expireAt: Date.now() + 5*60000 };
  // 演示模式：验证码直接展示。真实环境：此函数改为请求后端下发短信。
  toast(`演示验证码：${code}（5 分钟内有效）`);
  startCodeCountdown();
}
function startCodeCountdown(){
  clearInterval(codeTimer);
  codeCountdown = 60;
  const btn = document.getElementById('sendCodeBtn');
  const tick = () => {
    if(!btn) return;
    if(codeCountdown <= 0){ btn.disabled = false; btn.textContent = '获取验证码'; clearInterval(codeTimer); return; }
    btn.disabled = true;
    btn.textContent = codeCountdown + 's 后重发';
    codeCountdown--;
  };
  tick();
  codeTimer = setInterval(tick, 1000);
}
function doPhoneLogin(){
  const phone = (document.getElementById('loginPhoneInput').value || '').trim();
  const code = (document.getElementById('loginCodeInput').value || '').trim();
  if(!/^1\d{10}$/.test(phone)){ toast('请输入正确的 11 位手机号'); return; }
  if(!smsSession.phone || smsSession.phone !== phone){ toast('请先获取验证码'); return; }
  if(Date.now() > smsSession.expireAt){ toast('验证码已过期，请重新获取'); return; }
  if(code !== smsSession.code){ toast('验证码不正确'); return; }
  // 注册 / 登录一体：手机号没有账号则自动注册
  const reg = loadRegistry();
  const existId = Object.keys(reg).find(id => reg[id].type === 'phone' && reg[id].phone === phone);
  let account;
  if(existId){
    account = reg[existId];
    toast(`欢迎回来，${account.nickname || '用户'}`);
  }else{
    account = { id: 'u_' + uid(), type: 'phone', phone, nickname: '用户' + phone.slice(-4), avatar: null, createdAt: new Date().toISOString() };
    toast('注册成功，已自动登录');
  }
  setCurrentUser(account);
  closeLogin();
}

/* ---- 微信登录（需开放平台备案，暂未开放；代码保留待启用） ---- */
// 模拟微信 SDK 返回的 openId：同一台设备上保持稳定，保证退出后再次授权能找回同一账号
function mockWechatOpenId(){
  try{
    let oid = localStorage.getItem('shiguang_wechat_openid');
    if(!oid){ oid = 'wx' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); localStorage.setItem('shiguang_wechat_openid', oid); }
    return oid;
  }catch(e){ return 'wx' + Date.now().toString(36); }
}
function doWechatLogin(){
  const openId = mockWechatOpenId();
  const reg = loadRegistry();
  const existId = Object.keys(reg).find(id => reg[id].type === 'wechat' && reg[id].phone === openId);
  let account;
  if(existId){
    account = reg[existId];
    toast(`欢迎回来，${account.nickname || '用户'}`);
  }else{
    account = { id: 'u_' + uid(), type: 'wechat', phone: openId, nickname: '微信用户' + openId.slice(-4).toUpperCase(), avatar: null, createdAt: new Date().toISOString() };
    toast('微信授权成功，已自动登录');
  }
  setCurrentUser(account);
  closeLogin();
}

/* ---- 邮箱注册 / 登录（当前可用，无需备案） ---- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let emailMode = 'login';   // 'login' | 'register'
// 密码不在本机明文保存：SHA-256 加盐哈希（非安全上下文时降级标记，接入后端后由服务端接管）
async function hashPassword(pw){
  try{
    if(window.crypto && crypto.subtle && window.TextEncoder){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('shiguang::' + pw));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    }
  }catch(e){}
  return 'plain:' + pw;
}
let emailCodeStage = false;
let emailRegEmail = '', emailRegPass = '';
function setEmailMode(mode){
  emailMode = mode;
  emailCodeStage = false;
  const chips = document.querySelectorAll('#emailModeChips .chip');
  chips.forEach(c => c.classList.toggle('selected', c.dataset.mode === mode));
  document.getElementById('loginPass2Field').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('loginCodeField').style.display = 'none';
  document.getElementById('emailSubmitBtn').textContent = mode === 'register' ? '注册并登录' : '登录';
  document.getElementById('errEmail').style.display = 'none';
}
function setEmailCodeStage(on){
  emailCodeStage = on;
  document.getElementById('loginPass2Field').style.display = (!on && emailMode === 'register') ? 'block' : 'none';
  document.getElementById('loginPassField') && (document.getElementById('loginPassField').style.display = on ? 'none' : 'block');
  document.getElementById('loginCodeField').style.display = on ? 'block' : 'none';
  document.getElementById('emailSubmitBtn').textContent = on ? '完成注册' : (emailMode === 'register' ? '注册并登录' : '登录');
}
function showEmailError(msg){
  const err = document.getElementById('errEmail');
  err.textContent = msg;
  err.style.display = 'block';
}
async function doEmailLogin(){
  const email = (document.getElementById('loginEmailInput').value || '').trim().toLowerCase();
  const pass = document.getElementById('loginPassInput').value || '';
  const pass2 = document.getElementById('loginPass2Input').value || '';
  if(!EMAIL_RE.test(email)){ showEmailError('请输入有效的邮箱地址'); return; }
  if(pass.length < 6){ showEmailError('密码至少 6 位'); return; }
  if(emailMode === 'register' && !emailCodeStage && pass !== pass2){ showEmailError('两次输入的密码不一致'); return; }
  // ---- 云端模式（真实注册/登录：验证码两步式） ----
  if(window.CloudAuth && CloudAuth.active()){
    const btn = document.getElementById('emailSubmitBtn');
    try{
      if(emailMode === 'register'){
        if(!emailCodeStage){
          btn.disabled = true;
          await CloudAuth.sendRegisterCode(email);
          emailRegEmail = email; emailRegPass = pass;
          setEmailCodeStage(true);
          showEmailError('');
          document.getElementById('errEmail').style.display = 'none';
          toast('验证码已发送到邮箱，请查收（注意垃圾箱）');
        }else{
          const code = (document.getElementById('loginEmailCodeInput').value || '').trim();
          if(!code){ showEmailError('请输入邮件中的验证码'); return; }
          btn.disabled = true;
          const r0 = await CloudAuth.completeRegister(email, pass, code);
          if(!r0.signedIn){
            await CloudAuth.login(email, pass);
          }
          const cur = await CloudAuth.currentUser();
          const p = (cur && await CloudAuth.loadProfile(cur.uid)) || {};
          setCurrentUser({
            id: cur.uid, type: 'email', email: cur.email,
            nickname: p.nickname || cur.email.split('@')[0].slice(0, 12),
            gender: p.gender || '', birth: p.birth || '',
            avatar: p.avatar || null, createdAt: p.createdAt || new Date().toISOString(),
            cloud: true,
          });
          toast('注册成功，已登录');
          closeLogin();
        }
      }else{
        btn.disabled = true;
        const r = await CloudAuth.login(email, pass);
        let p = r.profile || {};
        // 头像偶发取不到（网络抖动）→ 立即重试一次
        if(!p.avatar){ try{ p = (await CloudAuth.loadProfile(r.uid)) || p; }catch(e2){} }
        setCurrentUser({
          id: r.uid, type: 'email', email: r.email,
          nickname: p.nickname || email.split('@')[0].slice(0, 12),
          gender: p.gender || '', birth: p.birth || '',
          avatar: p.avatar || null, createdAt: p.createdAt || new Date().toISOString(),
          cloud: true,
        });
        repairCloudAvatar();
        closeLogin();
      }
    }catch(e){ showEmailError(e.message); }
    finally{ btn.disabled = false; }
    return;
  }
  // ---- 本机演示模式（云服务不可用时自动降级） ----
  const passHash = await hashPassword(pass);
  const reg = loadRegistry();
  const existId = Object.keys(reg).find(id => reg[id].type === 'email' && (reg[id].email || '').toLowerCase() === email);
  let account;
  if(emailMode === 'register'){
    if(existId){ showEmailError('该邮箱已注册，请切换到登录'); return; }
    const nick = email.split('@')[0].slice(0, 12);
    account = { id: 'u_' + uid(), type: 'email', email, passHash, nickname: nick, avatar: null, createdAt: new Date().toISOString() };
    toast('注册成功，已自动登录');
  }else{
    if(!existId){ showEmailError('该邮箱尚未注册，请先注册'); return; }
    if(reg[existId].passHash !== passHash){ showEmailError('密码不正确'); return; }
    account = reg[existId];
    toast(`欢迎回来，${account.nickname || '用户'}`);
  }
  setCurrentUser(account);
  closeLogin();
}
function onEmailPassKeydown(ev){ if(ev && ev.key === 'Enter') doEmailLogin(); }

/* ---------------- 昵称修改 ---------------- */
function openNickEditor(){
  if(!currentUser){ toast('请先登录'); return; }
  document.getElementById('nickInput').value = currentUser.nickname || '';
  document.getElementById('nickOverlay').style.display = 'flex';
  setTimeout(() => { try{ document.getElementById('nickInput').focus(); }catch(e){} }, 60);
}
function closeNickEditor(){ document.getElementById('nickOverlay').style.display = 'none'; }
function saveNick(){
  if(!currentUser) return;
  const v = (document.getElementById('nickInput').value || '').trim();
  if(!v){ toast('昵称不能为空'); return; }
  currentUser.nickname = v.slice(0, 12);
  persistUser();
  saveAccountToRegistry();
  syncCloudProfile({ nickname: currentUser.nickname });
  renderUserCard();
  closeNickEditor();
  toast('昵称已更新');
}
// 云端资料同步（云模式下把资料补写到 users 集合）
function syncCloudProfile(patch){
  try{
    if(window.CloudAuth && currentUser && currentUser.cloud && currentUser.id){
      CloudAuth.saveProfile(currentUser.id, patch).catch(err => { toast('云端同步失败：' + err.message); });
    }
  }catch(e){}
}
function onNickKeydown(ev){ if(ev && ev.key === 'Enter') saveNick(); }

/* ---------------- 退出登录 ---------------- */
function logoutUser(){
  if(!currentUser) return;
  if(!confirm('退出登录后，本机事件数据仍会保留。确定退出吗？')) return;
  if(window.CloudAuth && currentUser.cloud) CloudAuth.logout();
  currentUser = null;
  try{ localStorage.removeItem(USER_KEY); }catch(e){}
  renderUserCard();
  toast('已退出登录');
}
