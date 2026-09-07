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
  renderInfoCard();
}
function initProfile(){
  loadUser(); renderUserCard(); renderInfoCard();
  if(window.CloudAuth){
    CloudAuth.init().then(() => restoreCloudSession());
  }
}
// 云端会话恢复：TCB 已登录用户 → 拉云端资料 → 渲染
async function restoreCloudSession(){
  if(!(window.CloudAuth && CloudAuth.active())) return;
  try{
    const u = await CloudAuth.currentUser();
    if(!u || !u.uid){ return; }
    const p = (await CloudAuth.loadProfile(u.uid)) || {};
    if(!currentUser || currentUser.id !== u.uid){
      setCurrentUser({
        id: u.uid, type: 'email', email: u.email || p.email || '',
        nickname: p.nickname || (u.email || '用户').split('@')[0].slice(0, 12),
        gender: p.gender || '', birth: p.birth || '',
        avatar: p.avatar || null, createdAt: p.createdAt || new Date().toISOString(),
        cloud: true,
      });
    }
  }catch(e){ console.warn('[cloud] 会话恢复失败:', e && e.message); }
}

/* ---------------- 用户卡片渲染 ---------------- */
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
function renderUserCard(){
  const box = document.getElementById('userCard');
  if(!box) return;
  if(!currentUser){
    box.innerHTML = `
      <div class="user-row" onclick="openLogin()" role="button" title="点击登录">
        <div class="user-avatar">👤</div>
        <div class="user-info"><b>未登录</b><small>点击登录，邮箱注册 / 登录</small></div>
        <span class="user-arrow">›</span>
      </div>`;
    renderInfoCard();
    return;
  }
  let who;
  if(currentUser.type === 'email') who = '📧 ' + esc(maskEmail(currentUser.email));
  else if(currentUser.type === 'phone') who = '📱 ' + esc(maskPhone(currentUser.phone));
  else who = '💬 微信登录';
  const joined = currentUser.createdAt ? esc(String(currentUser.createdAt).slice(0,10)) + ' 加入' : '';
  const avatarInner = isAvatarRef(currentUser.avatar)
    ? '<img id="userAvatarImg" alt="头像" />'
    : (isDataUrl(currentUser.avatar) ? `<img src="${esc(currentUser.avatar)}" alt="头像" />` : '👤');
  box.innerHTML = `
    <div class="user-row">
      <div class="user-avatar" onclick="onAvatarClick()" title="点击更换头像">
        ${avatarInner}<span class="avatar-edit-hint">换头像</span>
      </div>
      <div class="user-info">
        <b class="user-nick" onclick="openNickEditor()" title="点击修改昵称">${esc(currentUser.nickname || '用户')} <small>✎</small></b>
        <small>${who}${joined ? ' · ' + joined : ''}</small>
      </div>
      <button class="secondary" style="flex:none;padding:8px 14px" onclick="logoutUser()">退出</button>
    </div>
    <input type="file" id="avatarFile" accept="image/*" style="display:none" onchange="onAvatarPicked(event)" />`;
  // IndexedDB 里的头像引用：异步取回后填充
  if(isAvatarRef(currentUser.avatar)){
    mediaGet(currentUser.avatar).then(data => {
      const img = document.getElementById('userAvatarImg');
      if(img && data) img.src = data;
    });
  }
  renderInfoCard();
}

/* ---------------- 个人信息卡（邮箱 / 性别 / 出生年月） ---------------- */
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
function renderInfoCard(){
  const box = document.getElementById('infoCard');
  if(!box) return;
  if(!currentUser){
    box.innerHTML = '<div class="info-empty">登录后可完善性别、出生年月等个人资料</div>';
    return;
  }
  const birth = formatBirth(currentUser.birth);
  box.innerHTML = `
    <div class="info-row" title="${esc(accountTitle())}">
      <span class="info-label">📧 邮箱</span>
      <span class="info-value">${esc(currentUser.type === 'email' ? currentUser.email : accountTitle())}</span>
    </div>
    <div class="info-row" onclick="openInfoEditor()" role="button">
      <span class="info-label">🚻 性别</span>
      <span class="info-value ${currentUser.gender ? '' : 'info-unset'}">${esc(GENDER_LABEL[currentUser.gender] || '未设置')}</span>
      <span class="info-arrow">›</span>
    </div>
    <div class="info-row" onclick="openInfoEditor()" role="button">
      <span class="info-label">🎂 出生年月</span>
      <span class="info-value ${birth ? '' : 'info-unset'}">${esc(birth || '未设置')}</span>
      <span class="info-arrow">›</span>
    </div>`;
}
let pickedGender = '';
function openInfoEditor(){
  if(!currentUser){ openLogin(); return; }
  pickedGender = currentUser.gender || '';
  document.querySelectorAll('#genderChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.gender === pickedGender));
  const inp = document.getElementById('birthInput');
  inp.value = currentUser.birth || '';
  document.getElementById('birthClearRow').style.display = currentUser.birth ? 'block' : 'none';
  document.getElementById('infoOverlay').style.display = 'flex';
}
function closeInfoEditor(){ document.getElementById('infoOverlay').style.display = 'none'; }
function pickGender(g){
  pickedGender = g;
  document.querySelectorAll('#genderChips .chip').forEach(c => c.classList.toggle('selected', c.dataset.gender === g));
}
function clearBirth(){
  document.getElementById('birthInput').value = '';
  document.getElementById('birthClearRow').style.display = 'none';
}
function saveInfo(){
  if(!currentUser) return;
  const birth = (document.getElementById('birthInput').value || '').trim();
  if(birth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(birth)){ toast('出生年月格式不正确'); return; }
  currentUser.gender = pickedGender;
  currentUser.birth = birth;
  persistUser();
  saveAccountToRegistry();
  syncCloudProfile({ gender: currentUser.gender, birth: currentUser.birth });
  renderInfoCard();
  closeInfoEditor();
  toast('资料已保存');
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
  document.getElementById('loginOverlay').style.display = 'flex';
}
function closeLogin(){ document.getElementById('loginOverlay').style.display = 'none'; }
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
function setEmailMode(mode){
  emailMode = mode;
  const chips = document.querySelectorAll('#emailModeChips .chip');
  chips.forEach(c => c.classList.toggle('selected', c.dataset.mode === mode));
  document.getElementById('loginPass2Field').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('emailSubmitBtn').textContent = mode === 'register' ? '注册并登录' : '登录';
  document.getElementById('errEmail').style.display = 'none';
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
  if(emailMode === 'register' && pass !== pass2){ showEmailError('两次输入的密码不一致'); return; }
  // ---- 云端模式（真实注册/登录，验证邮件） ----
  if(window.CloudAuth && CloudAuth.active()){
    try{
      if(emailMode === 'register'){
        await CloudAuth.register(email, pass);
        setEmailMode('login');
        document.getElementById('loginEmailInput').value = email;
        document.getElementById('loginPassInput').value = '';
        document.getElementById('loginPass2Input').value = '';
        showEmailError('验证邮件已发送到 ' + email + '：请到邮箱点击链接完成验证，再回来登录');
        toast('验证邮件已发送，请查收');
      }else{
        const r = await CloudAuth.login(email, pass);
        const p = r.profile || {};
        setCurrentUser({
          id: r.uid, type: 'email', email: r.email,
          nickname: p.nickname || email.split('@')[0].slice(0, 12),
          gender: p.gender || '', birth: p.birth || '',
          avatar: p.avatar || null, createdAt: p.createdAt || new Date().toISOString(),
          cloud: true,
        });
        closeLogin();
      }
    }catch(e){ showEmailError(e.message); }
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
