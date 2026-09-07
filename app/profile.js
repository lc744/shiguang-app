// 绸缪 · 我的页（用户登录、头像上传、昵称修改）
// 演示模式：账号数据保存在本机（localStorage + IndexedDB），真实短信验证码 /
// 微信 OAuth 需要后端服务与开放平台资质，接入后只需替换 doPhoneLogin / doWechatLogin 两个入口。
/* ---------------- 用户状态 ---------------- */
const USER_KEY = 'shiguang_user';
const REGISTRY_KEY = 'shiguang_user_registry';   // 模拟服务端账户表（手机号/微信 openId → 账号资料）
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
function initProfile(){ loadUser(); renderUserCard(); }

/* ---------------- 用户卡片渲染 ---------------- */
function isAvatarRef(v){ return typeof v === 'string' && /^avatar:[A-Za-z0-9_\-]+$/.test(v); }
function maskPhone(phone){
  const p = String(phone || '');
  return p.length === 11 ? p.slice(0,3) + '****' + p.slice(7) : p;
}
function renderUserCard(){
  const box = document.getElementById('userCard');
  if(!box) return;
  if(!currentUser){
    box.innerHTML = `
      <div class="user-row" onclick="openLogin()" role="button" title="点击登录">
        <div class="user-avatar">👤</div>
        <div class="user-info"><b>未登录</b><small>点击登录，微信 / 手机号都可以</small></div>
        <span class="user-arrow">›</span>
      </div>`;
    return;
  }
  const who = currentUser.type === 'phone' ? '📱 ' + esc(maskPhone(currentUser.phone)) : '💬 微信登录';
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
}
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
}
function showLoginHome(){ loginPanel('home'); }
function showPhoneLogin(){
  loginPanel('phone');
  document.getElementById('loginPhoneInput').value = (currentUser && currentUser.type === 'phone') ? currentUser.phone : '';
  document.getElementById('loginCodeInput').value = '';
}
function showWechatLogin(){ loginPanel('wechat'); }

/* ---- 手机号 + 验证码 ---- */
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

/* ---- 微信登录（模拟授权） ---- */
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
  renderUserCard();
  closeNickEditor();
  toast('昵称已更新');
}
function onNickKeydown(ev){ if(ev && ev.key === 'Enter') saveNick(); }

/* ---------------- 退出登录 ---------------- */
function logoutUser(){
  if(!currentUser) return;
  if(!confirm('退出登录后，本机事件数据仍会保留。确定退出吗？')) return;
  currentUser = null;
  try{ localStorage.removeItem(USER_KEY); }catch(e){}
  renderUserCard();
  toast('已退出登录');
}
