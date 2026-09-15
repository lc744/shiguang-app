// 绸缪 · 分享页（与小程序 share/publish 页一致）
// 大家的推荐 / 我的发布 双分段；发布（照片≤3、类型、名称、推荐理由）；点赞、删除、举报
// 云端：profileApi 云函数（PG 存储）；未登录时引导登录，云不可用时提示
const SHARE_TYPES = ['美食', '景点', '娱乐'];
let shareTab = 'feed';
let shareList = [];
let sharePage = 0;
let shareHasMore = true;
let shareLoading = false;
let shareLoadedOnce = false;
let pubPhotos = [];      // [{t: 缩略图, f: 全图}]
let pubType = '美食';
let defaultPhotoCache = {}; // 类型 → 官方默认配图 {t, f}

/* ---------------- 数据接口 ---------------- */
function shareApi(action, data){
  if(!(window.CloudAuth && CloudAuth.active())){
    return Promise.reject(new Error('云服务不可用'));
  }
  const needsAuth = !(action === 'feed' || action === 'photo');
  if(needsAuth && !(CloudAuth.currentUser && CloudAuth.currentUser())){
    return Promise.reject(new Error('请先登录'));
  }
  return CloudAuth._profileApiCall(action, data, !needsAuth);
}

/* ---------------- 列表加载 ---------------- */
function switchShareTab(tab){
  if(shareTab === tab) return;
  shareTab = tab;
  const f = document.getElementById('segFeed'), m = document.getElementById('segMine');
  if(f && m){ f.classList.toggle('seg-on', tab === 'feed'); m.classList.toggle('seg-on', tab === 'mine'); }
  shareList = []; sharePage = 0; shareHasMore = true; shareLoadedOnce = true;
  loadShare(true);
}
function showShareTab(tab){ try{ showPage('page-share', document.querySelector('.tab[data-target=page-share]')); }catch(e){} switchShareTab(tab); }
function refreshShare(){ if(!shareLoadedOnce){ shareLoadedOnce = true; loadShare(true); } }

/* ---------------- 分享页下拉刷新 ---------------- */
(function initSharePTR(){
  function setup(){
    const sc = document.querySelector('#page-share .share-scroll');
    if(!sc || sc.dataset.ptr) return;
    sc.dataset.ptr = '1';
    const bar = document.createElement('div');
    bar.className = 'share-ptr';
    bar.innerHTML = '<span class="share-ptr-spin"></span><span class="share-ptr-txt">下拉刷新</span>';
    sc.insertBefore(bar, sc.firstChild);
    const spin = bar.querySelector('.share-ptr-spin');
    const txt = bar.querySelector('.share-ptr-txt');
    const THRESHOLD = 68;
    let startY = 0, armed = false, dist = 0, busy = false;
    sc.addEventListener('touchstart', (e) => {
      if(busy) return;
      if(sc.scrollTop <= 0){ startY = e.touches[0].clientY; armed = true; dist = 0; }
      else armed = false;
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if(!armed || busy) return;
      const dy = e.touches[0].clientY - startY;
      if(dy <= 0){ dist = 0; bar.style.height = '0px'; return; }
      dist = Math.min(100, Math.round(dy * 0.45));
      if(dist > 6){
        bar.style.transition = 'none';
        bar.style.height = dist + 'px';
        spin.classList.remove('on');
        txt.textContent = dist >= THRESHOLD ? '释放立即刷新' : '下拉刷新';
      }
    }, { passive: true });
    sc.addEventListener('touchend', () => {
      if(!armed) return;
      armed = false;
      bar.style.transition = '';
      if(dist >= THRESHOLD && typeof loadShare === 'function'){
        busy = true;
        bar.style.height = '44px';
        spin.classList.add('on');
        txt.textContent = '正在刷新…';
        Promise.resolve(loadShare(true)).catch(() => {}).finally(() => {
          setTimeout(() => { bar.style.height = '0px'; busy = false; }, 350);
        });
      } else {
        bar.style.height = '0px';
      }
      dist = 0;
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

async function loadShare(reset){
  if(shareLoading) return;
  if(!(window.CloudAuth && CloudAuth.active())){
    // init 可能尚未完成：等待探测结束后重判一次
    try{ if(window.CloudAuth) await CloudAuth.init(); }catch(e){}
    if(!(window.CloudAuth && CloudAuth.active())){ renderShareError('云服务不可用，稍后再试'); return; }
  }
  if(!(CloudAuth.currentUser && CloudAuth.currentUser())){ renderShareError('登录后即可浏览与发布分享'); return; }
  renderFeedFilter();
  if(reset) scenicPage = 0;   // 名胜流分页随 feed 重置
  shareLoading = true;
  const loadingEl = document.getElementById('shareLoading');
  if(loadingEl) loadingEl.style.display = 'block';
  shareApi(shareTab === 'feed' ? 'feed' : 'mine', {
    page: reset ? 0 : sharePage,
    city: (shareTab === 'feed' && feedMode !== 'default' && feedCity) ? feedCity : '',
    type: (shareTab === 'feed' && feedType) ? feedType : ''
  })
    .then(r => {
      if(!r || r.ok === false) throw new Error(r && r.error || '加载失败');
      const rows = r.list || [];
      shareList = reset ? rows : shareList.concat(rows);
      sharePage = (reset ? 0 : sharePage) + 1;
      shareHasMore = r.hasMore !== false && shareTab === 'feed';
      renderShareList();
    })
    .catch(e => { toast(e.message || '加载失败'); })
    .then(() => {
      shareLoading = false;
      if(loadingEl) loadingEl.style.display = 'none';
      const end = document.getElementById('shareEnd');
      if(end) end.style.display = (!shareHasMore && shareList.length > 3) ? 'block' : 'none';
    });
}

/* ---------------- 大众推荐筛选（模式：默认/按位置/选城市 × 类型：美食/景点/娱乐） ---------------- */
let feedMode = 'default';   // default | loc | city
let feedCity = '';          // 生效的城市名（推荐=定位城市；选城市=手选城市）
let feedType = '';          // '' 全部 | 美食 | 景点 | 娱乐
let locDetecting = false;

function renderFeedFilter(){
  const bar = document.getElementById('shareFilter');
  if(bar) bar.style.display = shareTab === 'feed' ? 'block' : 'none';
  document.querySelectorAll('#shareFilter .sf-mode').forEach(b => b.classList.toggle('on', b.dataset.mode === feedMode));
  document.querySelectorAll('#shareFilter .sf-type').forEach(b => b.classList.toggle('on', (b.dataset.type || '') === feedType));
  const lbl = document.getElementById('sfCityName');
  if(lbl) lbl.textContent = (feedCity && feedMode !== 'default') ? '：' + feedCity : '';
}

async function pickFeedMode(mode){
  if(mode === 'loc'){
    feedMode = 'loc';
    renderFeedFilter();
    if(!feedCity){ await detectFeedCity(); }
    loadShare(true);
    return;
  }
  if(mode === 'city'){
    openCityPick();   // 确定后再切换模式并刷新
    return;
  }
  feedMode = 'default';
  renderFeedFilter();
  loadShare(true);
}

function pickFeedType(t){
  feedType = t || '';
  renderFeedFilter();
  loadShare(true);
}

async function detectFeedCity(){
  if(locDetecting) return;
  locDetecting = true;
  try{
    toast('正在定位你的城市…');
    const ll = await getCoords();
    let n = null;
    try{ n = await bdcReverse(ll); }catch(e){ n = null; }
    if(!n || !n.prov){ try{ n = await nominatimReverse(ll); }catch(e){ n = null; } }
    if(n && n.city){ feedCity = n.city; toast('已按 ' + n.city + ' 推荐'); }
    else { feedCity = ''; toast('没识别到城市，可手动选城市或用默认推荐'); }
  }catch(e){
    feedCity = '';
    toast('定位失败，可手动选城市或用默认推荐');
  }finally{
    locDetecting = false;
    renderFeedFilter();
  }
}

async function openCityPick(ctx){
  planCtx = ctx || '';   // 默认用于 feed 筛选，防止残留 plan 态
  try{ await loadDivisions(); }catch(e){ toast('城市数据加载失败'); return; }
  const pv = document.getElementById('cfProv'), ct = document.getElementById('cfCity');
  if(!pv.options.length){
    pv.innerHTML = (divisions || []).map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('');
  }
  onCfProv();
  const t = document.getElementById('cfTitle');
  if(t) t.textContent = planCtx === 'plan' ? '选择攻略城市' : '选择推荐城市';
  const dateRow = document.getElementById('cfPlanDateRow');
  if(dateRow){
    if(planCtx === 'plan'){
      dateRow.style.display = 'block';
      const inp = document.getElementById('cfPlanDate');
      const d = new Date(); d.setDate(d.getDate() + 1);
      inp.value = todayStr(d);
      inp.min = todayStr();
    } else dateRow.style.display = 'none';
  }
  document.getElementById('cityPickOverlay').style.display = 'flex';
}
function onCfProv(){
  const p = (divisions || []).find(x => x.code === document.getElementById('cfProv').value);
  const cs = p ? (p.children || []) : [];
  const ct = document.getElementById('cfCity');
  // 直辖市（北京/上海/重庆）下级是"市辖区/县"，不是真实城市 → 直接按"全市"处理
  const real = cs.filter(c => c.name.indexOf('市辖区') < 0 && c.name !== '县');
  if(!real.length){
    ct.innerHTML = `<option value="__all__">${esc(p.name)}（全市）</option>`;
  } else {
    ct.innerHTML = real.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('');
  }
}
function confirmCityPick(){
  const p = (divisions || []).find(x => x.code === document.getElementById('cfProv').value);
  const cv = document.getElementById('cfCity').value;
  let name = '';
  if(cv === '__all__'){ name = p ? p.name : ''; }
  else { const c = p ? (p.children || []).find(x => x.code === cv) : null; name = c ? c.name : ''; }
  if(!p || !name){ toast('请选择城市'); return; }
  closeCityPick();
  if(planCtx === 'plan'){ planCtx = ''; const dv = (document.getElementById('cfPlanDate') || {}).value || ''; makeTravelPlan(name, dv); return; }
  feedCity = name;
  feedMode = 'city';
  renderFeedFilter();
  toast('已按 ' + name + ' 推荐');
  loadShare(true);
}
function closeCityPick(){ document.getElementById('cityPickOverlay').style.display = 'none'; }

/* ---------------- 行程攻略生成器 ---------------- */
let planCtx = '';        // cityPickOverlay 用途: '' = 筛选feed | 'plan' = 生成攻略
let pendingPlan = null;  // {city, date, items}
let planViewPid = '';

function openPlanMaker(){
  if(!(window.CloudAuth && CloudAuth.active()) || !(CloudAuth.currentUser && CloudAuth.currentUser())){ toast('请先登录'); return; }
  openCityPick('plan');
}

async function makeTravelPlan(city, dateIso){
  // 出行日期：默认明天；非法/过去日期回退明天
  const t0 = todayStr();
  const d1 = new Date(); d1.setDate(d1.getDate() + 1);
  const fallback = todayStr(d1);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateIso || '') || dateIso < t0) dateIso = fallback;
  toast('正在生成 ' + city + ' ' + (dateIso || '').slice(5).replace('-', '月') + '日 行程攻略…');
  try{
    // 串行拉取三个分类（间隔 400ms），避开云端每秒 20 次频控；限流失败自动重试
    const fetchFeed = async (type) => {
      for(let t = 0; t < 3; t++){
        try{
          const r = await shareApi('feed', { page: 0, city, type });
          await new Promise(res => setTimeout(res, 400));
          return r;
        }catch(err){
          if(t === 2) throw err;
          await new Promise(res => setTimeout(res, 900));
        }
      }
    };
    const food = await fetchFeed('美食');
    const spot = await fetchFeed('景点');
    const fun = await fetchFeed('娱乐');
    const foods = (food && food.list) || [];
    const plays = [].concat((spot && spot.list) || [], (fun && fun.list) || []);
    const mk = (slot, time, emoji, p, fbName, fbAddr) => ({
      slot, time, emoji,
      name: p ? (p.name || p.addr || fbName) : fbName,
      addr: p ? (p.addr || fbAddr || '') : fbAddr,
      pid: p ? p.id : '',
      thumb: (p && p.photos && p.photos[0]) ? p.photos[0] : ''
    });
    const picks = (arr, n) => {
      const a = (arr || []).slice();
      const out = [];
      while(out.length < n && a.length){ out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); }
      while(out.length < n) out.push(null);
      return out;
    };
    const [f1, f2, f3] = picks(foods, 3);
    const [p1, p2] = picks(plays, 2);
    const items = [
      mk('早餐', '08:00', '🥟', f1, '来一碗热乎的当地早餐', ''),
      mk('上午游玩', '10:00', '🏞', p1, '逛逛本地的经典去处', ''),
      mk('午餐', '12:00', '🍜', f2, '尝尝本地人气美味', ''),
      mk('下午游玩', '14:30', '🎡', p2, '继续探索这座城市', ''),
      mk('晚餐', '18:00', '🍲', f3, '用一顿好饭收尾', '')
    ];
    const d = new Date();
    pendingPlan = { city, date: dateIso.slice(5).replace('-', '月') + '日', dateIso, items };
    const url = await drawPlanPoster(pendingPlan);
    showPlanOverlay(url, 'new');
  }catch(e){
    toast(e.message || '攻略生成失败，稍后再试');
  }
}

function regenPlan(){
  if(!pendingPlan){ closePlanOverlay(); return; }
  makeTravelPlan(pendingPlan.city);
}

/* ---- 攻略一键添加到事件（按所选出行日期与推荐时间，行程模式：名称=行程·环节，备注=去往地址） ---- */
function addPlanToEvents(){
  if(!pendingPlan || !(pendingPlan.items || []).length){ toast('先生成一份攻略'); return; }
  const t0 = todayStr();
  let date = pendingPlan.dateIso || '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < t0){
    date = t0;
    if(pendingPlan.dateIso && pendingPlan.dateIso < t0) toast('出行日期已过，事件按今天创建');
  }
  let n = 0;
  pendingPlan.items.forEach(it => {
    const name = '行程·' + (it.slot || '');
    // 防重复：同日期同时段同名已存在则跳过
    if(events.some(e => e.name === name && e.date === date)) return;
    events.push({
      id: uid(),
      name,
      note: '去往' + (it.addr || it.name || ''),
      date,
      time: it.time || '09:00',
      emoji: it.emoji || EMOJIS[0],
      voice: VOICES[0],
      weekdays: [],
      doneOn: [],
      firedOn: []
    });
    n++;
  });
  persist(); renderAll(); renderBackupList();
  if(n){ toast(`已添加 ${n} 个行程提醒（${date.slice(5).replace('-', '月') + '日'}）`); closePlanOverlay(); }
  else toast('这些行程已在事件里，无需重复添加');
}

function showPlanOverlay(url, mode){
  const img = document.getElementById('planImg');
  if(img) img.src = url;
  document.getElementById('planTitle').textContent = mode === 'view' ? ('🧳 ' + pendingPlan.city + ' · ' + (pendingPlan.date || '')) : (pendingPlan.city + ' 一日游攻略已生成');
  document.getElementById('planBtnsNew').style.display = mode === 'new' ? 'flex' : 'none';
  document.getElementById('planBtnsView').style.display = mode === 'view' ? 'flex' : 'none';
  document.getElementById('planOverlay').style.display = 'flex';
}
function closePlanOverlay(){ document.getElementById('planOverlay').style.display = 'none'; }

/* ---- 海报绘制：750×1160 头部绿带 + 奶油底时间轴 ---- */
function roundRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function truncStr(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function loadImg(src){
  return new Promise(res => {
    if(!src){ res(null); return; }
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}
async function drawPlanPoster(plan){
  const W = 750, H = 1160;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  // 头部
  const grad = ctx.createLinearGradient(0, 0, W, 300);
  grad.addColorStop(0, '#2f5d4a'); grad.addColorStop(1, '#3f7d64');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 300);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.arc(W - 60, 40, 110, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(50, 280, 70, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = '700 30px sans-serif'; ctx.fillText('— 一日游行程攻略 —', W / 2, 96);
  ctx.font = '800 72px sans-serif'; ctx.fillText(truncStr(plan.city, 8), W / 2, 190);
  ctx.font = '400 26px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(plan.date + ' · 由「绸缪」大众推荐生成', W / 2, 248);
  // 身体
  ctx.fillStyle = '#faf6ee'; ctx.fillRect(0, 300, W, H - 300);
  const rowH = 152, top0 = 330;
  const imgs = await Promise.all(plan.items.map(it => loadImg(it.thumb)));
  plan.items.forEach((it, i) => {
    const y = top0 + i * rowH;
    // 时间胶囊
    ctx.fillStyle = '#2f5d4a';
    roundRectPath(ctx, 46, y + 34, 96, 44, 22); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '600 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(it.time, 94, y + 64);
    // 封面/emoji 圆
    const cx = 196, cy = y + 56, r = 44;
    if(imgs[i]){
      ctx.save(); roundRectPath(ctx, cx - r, cy - r, r * 2, r * 2, 16); ctx.clip();
      ctx.drawImage(imgs[i], cx - r, cy - r, r * 2, r * 2); ctx.restore();
    } else {
      ctx.fillStyle = '#e6efe8'; roundRectPath(ctx, cx - r, cy - r, r * 2, r * 2, 16); ctx.fill();
      ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(it.emoji, cx, cy + 2); ctx.textBaseline = 'alphabetic';
    }
    // 文案
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8aa898'; ctx.font = '600 24px sans-serif';
    ctx.fillText(it.slot, 268, y + 40);
    ctx.fillStyle = '#26443a'; ctx.font = '700 34px sans-serif';
    ctx.fillText(truncStr(it.name, 11), 268, y + 82);
    ctx.fillStyle = '#7c948a'; ctx.font = '400 23px sans-serif';
    ctx.fillText(truncStr(it.addr || '地址待探索', 18), 268, y + 120);
    // 分隔线
    if(i < plan.items.length - 1){
      ctx.strokeStyle = '#eee4d4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(46, y + rowH - 6); ctx.lineTo(W - 46, y + rowH - 6); ctx.stroke();
    }
  });
  // 底部
  ctx.textAlign = 'center'; ctx.fillStyle = '#b3a893'; ctx.font = '400 22px sans-serif';
  ctx.fillText('早 → 晚行程一图掌握 · 快去「绸缪」发布你的推荐', W / 2, H - 36);
  return cv.toDataURL('image/jpeg', 0.88);
}

/* ---- 保存 / 我的攻略 ---- */
async function saveTravelPlan(){
  if(!pendingPlan) return;
  try{
    // 控制体积：优先保留缩略图，超限则逐个丢弃
    const strip = it => Object.assign({}, it, { thumb: '' });
    let items = pendingPlan.items;
    let content = JSON.stringify({ city: pendingPlan.city, date: pendingPlan.date, dateIso: pendingPlan.dateIso || '', items });
    let idx = 0;
    while(content.length > 55000 && items.some(x => x.thumb)){
      const cand = items.map((x, i2) => ({ i: i2, len: (x.thumb || '').length })).filter(x => x.len).sort((a, b) => b.len - a.len)[0];
      if(!cand) break;
      items = items.map((x, i2) => i2 === cand.i ? strip(x) : x);
      content = JSON.stringify({ city: pendingPlan.city, date: pendingPlan.date, dateIso: pendingPlan.dateIso || '', items });
      idx++;
    }
    const r = await shareApi('planSave', { city: pendingPlan.city, content });
    if(!r || r.ok === false) throw new Error(r && r.error || '保存失败');
    closePlanOverlay();
    toast('已保存到 我的·旅游攻略');
  }catch(e){ toast(e.message || '保存失败'); }
}

async function openPlansOverlay(){
  if(!(window.CloudAuth && CloudAuth.active()) || !(CloudAuth.currentUser && CloudAuth.currentUser())){ toast('请先登录'); return; }
  document.getElementById('plansOverlay').style.display = 'flex';
  const box = document.getElementById('plansList');
  box.innerHTML = '<small style="opacity:.6">加载中…</small>';
  try{
    const r = await shareApi('planList', {});
    const list = (r && r.list) || [];
    if(!list.length){ box.innerHTML = '<small style="opacity:.6;display:block;text-align:center;padding:18px 0">还没有攻略，去分享页点「🧳 攻略」生成一张吧</small>'; return; }
    box.innerHTML = list.map(p => {
      const th = (p.items || []).find(x => x.thumb);
      const names = (p.items || []).filter(x => x.pid).map(x => x.name).slice(0, 3).join(' · ');
      return `<div class="plan-item" onclick="viewSavedPlan('${esc(p.pid)}')">
        ${th ? `<img class="plan-item-img" src="${esc(th.thumb)}" />` : '<text class="plan-item-img plan-item-ph">🧳</text>'}
        <div class="plan-item-txt">
          <b>${esc(p.city)} · 一日游</b>
          <small>${esc(names || '暂无具体点位')}</small>
          <small style="opacity:.7">${esc((p.time || '').slice(0, 10))}</small>
        </div>
        <text class="me-arrow">›</text>
      </div>`;
    }).join('');
  }catch(e){
    box.innerHTML = '<small style="opacity:.6">加载失败：' + esc(e.message || '') + '</small>';
  }
}
function closePlansOverlay(){ document.getElementById('plansOverlay').style.display = 'none'; }
let plansCache = [];

/* ---------------- 我的评论（我的页） ---------------- */
const CMT_TYPE_EMOJI = { '美食': '🍜', '景点': '🏞', '娱乐': '🎡', '餐厅': '🍜' };
async function openMyComments(){
  if(!(window.CloudAuth && CloudAuth.active()) || !(CloudAuth.currentUser && CloudAuth.currentUser())){ toast('请先登录'); return; }
  document.getElementById('myCommentsOverlay').style.display = 'flex';
  const box = document.getElementById('myCommentsList');
  box.innerHTML = '<small style="opacity:.6">加载中…</small>';
  try{
    const r = await shareApi('myComments', {});
    const list = (r && r.list) || [];
    if(!list.length){ box.innerHTML = '<small style="opacity:.6;display:block;text-align:center;padding:18px 0">还没有评论，去帖子下面聊聊吧</small>'; return; }
    box.innerHTML = list.map(c => {
      const gone = c.hidden || (!c.pid && !c.pname);
      const emoji = CMT_TYPE_EMOJI[c.ptype] || '📌';
      const postName = c.pname || c.paddr || '帖子';
      return `<div class="mc-item ${gone ? 'mc-gone' : ''}" ${gone ? '' : `onclick="jumpToCommentPost('${esc(c.pid)}')"`} role="button">
        <div class="mc-post"><text>${emoji}</text> ${esc(truncStr(postName, 16))}${gone ? '<b class="mc-gone-tag">（帖子已删除）</b>' : '<text class="me-arrow">›</text>'}</div>
        <div class="mc-cmt">${esc(c.content)}</div>
        <small class="mc-time">${esc(c.time || '')}</small>
      </div>`;
    }).join('');
  }catch(e){
    box.innerHTML = '<small style="opacity:.6">加载失败：' + esc(e.message || '') + '</small>';
  }
}
function closeMyComments(){ document.getElementById('myCommentsOverlay').style.display = 'none'; }
async function jumpToCommentPost(pid){
  if(!pid) return;
  closeMyComments();
  try{
    showPage('page-share', document.querySelector('.tab[data-target=page-share]'));
    showShareTab('feed');
    feedMode = 'default'; feedType = '';
    renderFeedFilter();
    await loadShare(true);
    await new Promise(r => setTimeout(r, 2500));
    let idx = shareList.findIndex(x => x.id === pid);
    if(idx < 0){
      const r = await shareApi('postGet', { id: pid }).catch(() => null);
      if(r && r.post && r.post.id){ shareList.push(r.post); renderShareList(); idx = shareList.length - 1; }
    }
    if(idx >= 0){ openPostDetail(idx); }
    else { toast('帖子可能已删除'); }
  }catch(e){ toast('跳转失败，稍后再试'); }
}
async function viewSavedPlan(pid){
  try{
    const r = await shareApi('planList', {});
    plansCache = (r && r.list) || [];
  }catch(e){}
  const p = plansCache.find(x => x.pid === pid);
  if(!p){ toast('攻略不存在或已删除'); openPlansOverlay(); return; }
  planViewPid = pid;
  pendingPlan = { city: p.city, date: (p.time || '').slice(5, 10).replace('-', '月') + '日', dateIso: p.planDate || '', items: p.items || [] };
  if(pendingPlan.dateIso) pendingPlan.date = pendingPlan.dateIso.slice(5).replace('-', '月') + '日';
  const url = await drawPlanPoster(pendingPlan);
  closePlansOverlay();
  showPlanOverlay(url, 'view');
}
async function delSavedPlan(){
  if(!planViewPid) return;
  try{ await shareApi('planDel', { pid: planViewPid }); }catch(e){}
  planViewPid = '';
  closePlanOverlay();
  toast('攻略已删除');
}
function renderShareError(msg){
  shareList = [];
  renderShareList(msg);
}

/* ---------------- 官方名胜推荐流（feed 空态填充） ---------------- */
let scenicPage = 0;
const SCENIC_PAGE_SIZE = 12;
function scenicPool(){
  // 筛选了城市时优先展示该城市的景点；没有匹配则回退全部
  if(shareTab === 'feed' && feedCity){
    const bare = feedCity.replace(/市$/, '');
    const hit = SCENIC_SPOTS.filter(s => s.c === bare || s.p === bare || (s.c + '市') === feedCity);
    if(hit.length) return hit;
  }
  return SCENIC_SPOTS;
}
function scenicCityParam(s){
  // 帖子 addr 是完整地址，用 LIKE 匹配：城市名带"市"（直辖市/地级市通用）
  return s.c + '市';
}
function renderScenicHtml(){
  const pool = scenicPool();
  const shown = pool.slice(0, Math.min((scenicPage + 1) * SCENIC_PAGE_SIZE, pool.length));
  const inCity = feedCity && pool !== SCENIC_SPOTS;
  const head = `<div class="scenic-head"><b>🏛️ 国家名胜 · 官方推荐</b><small>${inCity ? esc(feedCity) + ' · ' : ''}共 ${pool.length} 个精选景点，<a href="javascript:void(0)" onclick="openScenicOverlay()">打开名胜库</a></small></div>`;
  const cards = shown.map((s, i) => `
    <div class="post-card card scenic-card">
      <div class="scenic-cover" onclick="scenicAction(${i}, 'plan')">
        <text class="scenic-emoji">${s.e}</text>
        <text class="scenic-tag">${esc(s.t)} · ${esc(s.p)}</text>
        <text class="scenic-level s-lv${s.a || 0}">${esc(scenicLevel(s.a))}</text>
      </div>
      <div class="post-body">
        <div class="post-head"><text class="post-name">${esc(s.n)}</text><text class="post-type">${esc(s.c)}</text></div>
        <text class="post-desc">${esc(s.d)}</text>
        <div class="scenic-actions">
          <button class="secondary" onclick="scenicAction(${i}, 'plan')">🗓️ 生成${esc(s.c)}攻略</button>
          <button class="secondary" onclick="scenicAction(${i}, 'city')">📍 看分享</button>
        </div>
      </div>
    </div>`).join('');
  const rest = pool.length - shown.length;
  const more = rest > 0 ? `<div class="scenic-more"><button class="secondary" onclick="scenicMore()">看更多名胜（还剩 ${rest} 个）</button></div>` : '';
  return head + cards + more;
}
function scenicMore(){ scenicPage++; renderShareList(); }
function scenicAction(i, kind){
  const s = scenicPool()[i];
  if(!s) return;
  const city = scenicCityParam(s);
  if(kind === 'plan'){ makeTravelPlan(city); return; }
  closeScenicOverlay();
  feedCity = city;
  feedMode = 'city';
  renderFeedFilter();
  toast('已按 ' + city + ' 筛选');
  loadShare(true);
}

/* ---------------- 国家名胜库（独立入口浏览） ---------------- */
let scenicGrade = '';
function openScenicOverlay(){
  const ov = document.getElementById('scenicOverlay');
  if(!ov) return;
  ov.style.display = 'flex';
  // 隐藏分享页本体，避免与弹层重叠
  const page = document.getElementById('page-share');
  if(page) page.style.visibility = 'hidden';
  const sel = document.getElementById('scenicProv');
  if(sel && sel.options.length <= 1){
    const provs = Array.from(new Set(SCENIC_SPOTS.map(s => s.p)));
    sel.innerHTML = '<option value="">全部省份</option>' + provs.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  }
  document.getElementById('scenicEntryCount').textContent = SCENIC_SPOTS.length;
  renderScenicLib();
}
function closeScenicOverlay(){
  const ov = document.getElementById('scenicOverlay');
  if(ov) ov.style.display = 'none';
  const page = document.getElementById('page-share');
  if(page) page.style.visibility = '';
}
function pickScenicGrade(g){
  scenicGrade = g;
  document.querySelectorAll('#scenicOverlay .scenic-lib-grades .sf-chip').forEach(b => b.classList.toggle('on', b.dataset.g === g));
  renderScenicLib();
}
function renderScenicLib(){
  const box = document.getElementById('scenicLibList');
  if(!box) return;
  const prov = (document.getElementById('scenicProv') || {}).value || '';
  const kw = ((document.getElementById('scenicSearch') || {}).value || '').trim();
  let list = SCENIC_SPOTS;
  if(prov) list = list.filter(s => s.p === prov);
  if(scenicGrade) list = list.filter(s => String(s.a || 0) === scenicGrade);
  if(kw) list = list.filter(s => s.n.indexOf(kw) >= 0 || s.c.indexOf(kw) >= 0 || s.d.indexOf(kw) >= 0);
  document.getElementById('scenicEntryCount').textContent = list.length;
  if(!list.length){ box.innerHTML = '<div class="scenic-empty">没有匹配的景点，换个条件试试</div>'; return; }
  box.innerHTML = list.map((s, i) => `
    <div class="post-card card scenic-card">
      <div class="scenic-cover" onclick="scenicLibAction(${SCENIC_SPOTS.indexOf(s)}, 'plan')">
        <text class="scenic-emoji">${s.e}</text>
        <text class="scenic-tag">${esc(s.t)} · ${esc(s.p)}</text>
        <text class="scenic-level s-lv${s.a || 0}">${esc(scenicLevel(s.a))}</text>
      </div>
      <div class="post-body">
        <div class="post-head"><text class="post-name">${esc(s.n)}</text><text class="post-type">${esc(s.c)}</text></div>
        <text class="post-desc">${esc(s.d)}</text>
        <div class="scenic-actions">
          <button class="secondary" onclick="scenicLibAction(${SCENIC_SPOTS.indexOf(s)}, 'plan')">🗓️ 生成${esc(s.c)}攻略</button>
          <button class="secondary" onclick="scenicLibAction(${SCENIC_SPOTS.indexOf(s)}, 'city')">📍 看分享</button>
        </div>
      </div>
    </div>`).join('');
}
function scenicLibAction(spotIdx, kind){
  const s = SCENIC_SPOTS[spotIdx];
  if(!s) return;
  const city = scenicCityParam(s);
  if(kind === 'plan'){ makeTravelPlan(city); return; }
  closeScenicOverlay();
  feedCity = city;
  feedMode = 'city';
  renderFeedFilter();
  toast('已按 ' + city + ' 筛选');
  loadShare(true);
}
function renderShareList(errMsg){
  const box = document.getElementById('shareList');
  const empty = document.getElementById('shareEmpty');
  if(!box) return;
  if(errMsg){
    box.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('shareEmptyEmoji').textContent = '😴';
    document.getElementById('shareEmptyText').textContent = errMsg;
    document.querySelector('.share-cta').style.display = 'none';
    return;
  }
  document.querySelector('.share-cta').style.display = '';
  document.getElementById('shareEmptyEmoji').textContent = shareTab === 'feed' ? '🌱' : '📭';
  const filtered = shareTab === 'feed' && (feedType || (feedMode !== 'default' && feedCity));
  document.getElementById('shareEmptyText').textContent = filtered ? '当前筛选条件下还没有分享，换个筛选试试' : (shareTab === 'feed' ? '还没有人分享，来当第一个' : '你还没有发布过');
  if(!shareList.length){
    empty.style.display = 'block';
    // 冷启动：feed 空态用「国家名胜」官方推荐流填充，仍有东西可刷
    if(shareTab === 'feed' && typeof SCENIC_SPOTS !== 'undefined'){
      // 名胜流模式下压缩空态提示区（大 emoji 改小条），让名胜卡更早入屏
      empty.classList.add('share-empty-compact');
      box.innerHTML = renderScenicHtml();
      return;
    }
    empty.classList.remove('share-empty-compact');
    box.innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  shareList.forEach((p, i) => { p._idx = i; });
  box.innerHTML = shareList.map(p => {
    const photos = (p.photos || []);
    const cover = photos[0] || '';
    const photoHtml = cover ? `
      <div class="post-cover" onclick="openPostDetail(${p._idx})">
        <img src="${esc(cover)}" loading="lazy" />
        ${photos.length > 1 ? `<text class="pd-badge">📷 ${photos.length}张</text>` : ''}
      </div>` : '';
    return `
      <div class="post-card card">
        ${photoHtml}
        <div class="post-body">
          <div class="post-head"><text class="post-type">${esc(p.type || '娱乐')}</text>${p.name ? `<text class="post-name">${esc(p.name)}</text>` : ''}</div>
          ${p.addr ? `<text class="post-addr">📍 ${esc(p.addr)}</text>` : ''}
          ${p.desc ? `<text class="post-desc">${esc(p.desc)}</text>` : ''}
          <div class="post-meta">
            ${p.avatar ? `<img class="post-avatar" src="${esc(p.avatar)}" />` : '<text class="post-avatar post-avatar-ph">👤</text>'}
            <text class="post-author">${esc(p.nickname || '路过的朋友')}</text>
            <view class="post-tools">
              <text class="post-tool ${p.selfLiked ? 'liked' : ''}" onclick="onShareLike('${esc(p.id)}')">${p.selfLiked ? '❤️' : '🤍'} ${p.likes || 0}</text>
              ${shareTab === 'feed' ? `<text class="post-tool" onclick="onShareReport('${esc(p.id)}')">举报</text>` : ''}
              ${shareTab === 'mine' ? `<text class="post-tool danger" onclick="onShareDel('${esc(p.id)}')">删除</text>` : ''}
            </view>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ---------------- 点赞 / 删除 / 举报 ---------------- */
function onShareLike(id){
  shareApi('like', { id })
    .then(r => {
      if(!r || r.ok === false) throw new Error(r && r.error || '操作失败');
      const it = shareList.find(x => x.id === id);
      if(it){ it.selfLiked = r.liked; it.likes = (it.likes || 0) + (r.liked ? 1 : -1); renderShareList(); }
    })
    .catch(e => toast(e.message || '操作失败'));
}
function onShareDel(id){
  if(!confirm('删除这条发布？照片与内容将一并删除，不可恢复')) return;
  shareApi('del', { id })
    .then(r => {
      if(!r || r.ok === false) throw new Error(r && r.error || '删除失败');
      toast('已删除');
      shareList = shareList.filter(x => x.id !== id);
      renderShareList();
    })
    .catch(e => toast(e.message || '删除失败'));
}
function onShareReport(id){
  const reason = prompt('简述举报理由（选填）') || '';
  if(reason === null) return;
  shareApi('report', { id, reason })
    .then(r => {
      if(!r || r.ok === false) throw new Error(r && r.error || '举报失败');
      if(r.hiddenNow){ toast('内容已隐藏'); loadShare(true); }
      else if(r.already) toast('你已举报过该内容');
      else toast('举报已收到');
    })
    .catch(e => toast(e.message || '举报失败'));
}

/* ---------------- 帖子详情页（列表只显封面，点开看全部大图） ---------------- */
function openPostDetail(idx){
  const p = shareList[idx]; if(!p) return;
  const photos = (p.photos || []);
  const body = document.getElementById('postDetailBody');
  body.innerHTML = `
    <div class="post-head"><text class="post-type">${esc(p.type || '娱乐')}</text>${p.name ? `<text class="post-name">${esc(p.name)}</text>` : ''}</div>
    ${p.addr ? `<text class="post-addr">📍 ${esc(p.addr)}<small class="addr-note">（地址仅供参考）</small></text>` : ''}
    ${p.desc ? `<text class="post-desc">${esc(p.desc)}</text>` : ''}
    ${photos.length ? `<div class="pd-photos">${photos.map((ph, i) => `<img class="pd-photo" id="pdImg${i}" src="${esc(ph)}" loading="lazy" onclick="previewSharePhoto(${idx}, ${i})" />`).join('')}</div>` : '<text class="post-desc" style="opacity:.6">（没有配图）</text>'}
    <div class="post-meta">
      ${p.avatar ? `<img class="post-avatar" src="${esc(p.avatar)}" />` : '<text class="post-avatar post-avatar-ph">👤</text>'}
      <text class="post-author">${esc(p.nickname || '路过的朋友')}</text>
      <view class="post-tools">
        <text class="post-tool ${p.selfLiked ? 'liked' : ''}" onclick="onShareLike('${esc(p.id)}')">${p.selfLiked ? '❤️' : '🤍'} ${p.likes || 0}</text>
        <text class="post-tool" onclick="addPostToTrip(${idx})">🗓 行程</text>
      </view>
    </div>
    <div class="pd-cmt">
      <div class="pd-cmt-head">评论 <span id="pdCmtCount">…</span></div>
      <div class="pd-cmt-list" id="pdCmtList"><small style="opacity:.6">加载评论…</small></div>
      <div class="pd-cmt-input">
        <input id="pdCmtInput" placeholder="说点什么…" maxlength="200" onkeydown="if(event.key==='Enter')sendPostComment(${idx})" />
        <button class="primary" onclick="sendPostComment(${idx})">发送</button>
      </div>
    </div>`;
  document.getElementById('postDetail').style.display = 'flex';
  // 管理员管理行
  isAdminUser().then(am => {
    const bar = document.getElementById('pdAdminBar');
    if(bar) bar.remove();
    if(am){
      const div = document.createElement('div');
      div.className = 'pd-admin-bar'; div.id = 'pdAdminBar';
      div.innerHTML = `<text>🛡 管理：</text>` +
        (p.hidden ? `<text onclick="adminOp('unhidePost','${esc(p.id)}')">恢复显示</text>` : `<text onclick="adminOp('hidePost','${esc(p.id)}')">隐藏帖子</text>`) +
        `<text class="danger-text" onclick="adminOp('delPost','${esc(p.id)}')">删除帖子</text>`;
      document.getElementById('postDetailBody').appendChild(div);
    }
  }).catch(() => {});
  // 详情里的图逐张换成高清全图（列表/详情先显示缩略图）
  photos.forEach((ph, i) => {
    shareApi('photo', { id: p.id, i }).then(r => {
      if(r && r.url && String(r.url).indexOf('data:') === 0){
        const img = document.getElementById('pdImg' + i);
        if(img) img.src = r.url;
      }
    }).catch(() => {});
  });
  loadPostComments(idx);
}
function closePostDetail(){ document.getElementById('postDetail').style.display = 'none'; }

/* ---------------- 管理员操作 ---------------- */
async function adminOp(op, id){
  try{
    const r = await shareApi('adminAction', { op, id });
    if(!r || r.ok === false) throw new Error(r && r.error || '操作失败');
    if(op === 'hidePost'){ toast('已隐藏该帖子'); closePostDetail(); if(typeof loadShare === 'function') loadShare(true); }
    else if(op === 'unhidePost'){ toast('已恢复显示'); closePostDetail(); }
    else if(op === 'delPost'){ toast('帖子已删除'); closePostDetail(); loadShare(true); }
  }catch(e){ toast(e.message || '操作失败'); }
}
async function adminDelComment(cid, refresh){
  try{ await shareApi('adminAction', { op: 'delComment', cid }); toast('评论已删除'); if(refresh) refreshAdminPanel(); }catch(e){ toast('操作失败'); }
}
async function adminRestoreComment(cid){
  try{ await shareApi('adminAction', { op: 'unhideComment', cid }); toast('评论已恢复'); refreshAdminPanel(); }catch(e){ toast('操作失败'); }
}
async function refreshAdminPanel(){ openAdminPanel(true); }
async function openAdminPanel(silent){
  if(!(window.CloudAuth && CloudAuth.active() && CloudAuth.currentUser())){ toast('请先登录'); return; }
  if(!silent){ document.getElementById('adminOverlay').style.display = 'flex'; }
  const box = document.getElementById('adminPanelBody');
  if(!silent) box.innerHTML = '<small style="opacity:.6">验证权限…</small>';
  // 权限验证带重试（面板场景 2 次≈5s，避免久等）：网络失败不误报"需要管理员权限"
  const am = await new Promise(res => whenAdmin(() => res(true), () => res(false), 2));
  if(!am){
    if(silent){ toast('需要管理员权限'); return; }
    box.innerHTML = '<small style="opacity:.6">需要管理员权限</small>';
    setTimeout(() => { try{ closeAdminPanel(); }catch(e){} }, 1500);
    return;
  }
  if(!silent) box.innerHTML = '<small style="opacity:.6">加载中…</small>';
  // 管理员打开面板时顺带刷新自己的心跳
  try{ if(window.CloudAuth && CloudAuth._profileApiCall) await CloudAuth._profileApiCall('heartbeat', { nickname: (function(){ try{ const u = JSON.parse(localStorage.getItem('shiguang_user') || 'null'); return (u && u.nickname) || ''; }catch(e){ return ''; } })() }); }catch(e){}
  const pendingP = shareApi('adminAction', { op: 'pending' }).catch(e => ({ err: e }));
  const usersP = shareApi('adminAction', { op: 'users' }).catch(e => ({ err: e }));
  let usersHtml = '';
  try{
    const ur = await usersP;
    if(ur && ur.ok !== false && ur.list){
      const users = ur.list;
      const fmtAgo = (s) => {
        if(s < 0) return '从未上线';
        if(s < 60) return '刚刚';
        if(s < 3600) return Math.floor(s / 60) + ' 分钟前';
        if(s < 86400) return Math.floor(s / 3600) + ' 小时前';
        return Math.floor(s / 86400) + ' 天前';
      };
      const online = users.filter(u => u.agoSec >= 0 && u.agoSec <= 300).length;
      const recent = users.filter(u => u.agoSec > 300 && u.agoSec <= 1800).length;
      usersHtml = '<b style="font-size:13px;display:block;margin-bottom:6px">👥 用户在线 <small style="font-weight:400;opacity:.6">共 ' + users.length + ' 人 · 🟢 在线 ' + online + ' · 🟡 最近 ' + recent + '</small></b>' +
        users.map(u => {
          const name = esc(u.nickname || (u.email || '').split('@')[0] || '用户');
          const dot = u.agoSec < 0 ? '⚪' : (u.agoSec <= 300 ? '🟢' : (u.agoSec <= 1800 ? '🟡' : '⚪'));
          const idTag = (u.email ? esc(u.email) : '…' + esc(u.uidTail)) + ' <small style="opacity:.5">…' + esc(u.uidTail) + '</small>';
          return '<div class="adm-item"><div class="adm-txt"><b>' + dot + ' ' + name + '</b><small>' + idTag + '</small></div><div class="adm-ops"><small style="opacity:.6">' + fmtAgo(u.agoSec) + '</small></div></div>';
        }).join('');
    }
  }catch(e){}
  try{
    const r = await pendingP;
    const posts = (r && r.posts) || [];
    const comments = (r && r.comments) || [];
    if(!posts.length && !comments.length && !usersHtml){
      box.innerHTML = '<small style="opacity:.6;display:block;text-align:center;padding:14px 0">当前没有待审内容 ✨</small>';
      return;
    }
    box.innerHTML = usersHtml + '<div style="margin-top:10px"></div>' +
      (posts.length ? '<b style="font-size:13px">被隐藏的帖子</b>' + posts.map(p => `
        <div class="adm-item">
          <div class="adm-txt"><b>${esc(p.name || p.addr || '（无标题）')}</b><small>${esc(p.type || '')} · 举报${p.reports}次 · ${esc(p.time || '')}</small></div>
          <div class="adm-ops"><button class="secondary" onclick="adminOp('unhidePost','${esc(p.id)}')">恢复</button><button class="secondary danger-text" onclick="adminOp('delPost','${esc(p.id)}')">删除</button></div>
        </div>`).join('') : '') +
      (comments.length ? '<b style="font-size:13px;display:block;margin-top:10px">被隐藏的评论</b>' + comments.map(c => `
        <div class="adm-item">
          <div class="adm-txt"><b>${esc(c.content).slice(0, 40)}</b><small>${esc(c.nickname || '')} · 举报${c.reports}次 · 帖：${esc(c.pname || '').slice(0, 10)}</small></div>
          <div class="adm-ops"><button class="secondary" onclick="adminRestoreComment('${esc(c.cid)}')">恢复</button><button class="secondary danger-text" onclick="adminDelComment('${esc(c.cid)}')">删除</button></div>
        </div>`).join('') : '');
  }catch(e){
    box.innerHTML = '<small style="opacity:.6">加载失败：' + esc(e.message || '') + '</small>';
  }
}
function closeAdminPanel(){ document.getElementById('adminOverlay').style.display = 'none'; }

/* ---------------- 详情页评论区 ---------------- */
async function myUid(){ try{ const u = CloudAuth.currentUser ? await CloudAuth.currentUser() : null; return u ? u.uid : ''; }catch(e){ return ''; } }
async function isAdminUser(){
  // 每次实查不缓存：避免账号切换后残留上一账号的管理员状态
  try{
    const r = await shareApi('adminCheck', {});
    if(r && r.ok !== false) return !!(r && r.isAdmin);
  }catch(e){ /* 登录态未就绪或网络失败 */ }
  return false;
}
/* 管理入口助手：登录态未就绪时自动重试，就绪后回调，全部失败走 failCb */
function whenAdmin(cb, failCb, maxTries){
  let tries = 0;
  const cap = maxTries || 4;
  const go = () => {
    isAdminUser().then(am => {
      if(am) cb();
      else if(tries < cap){ tries++; setTimeout(go, 2500); }
      else if(failCb) failCb();
    }).catch(() => { if(tries < cap){ tries++; setTimeout(go, 2500); } else if(failCb) failCb(); });
  };
  go();
}
async function loadPostComments(idx){
  const p = shareList[idx]; if(!p) return;
  const listEl = document.getElementById('pdCmtList');
  const cntEl = document.getElementById('pdCmtCount');
  if(!listEl) return;
  try{
    const r = await shareApi('commentList', { id: p.id });
    const list = (r && r.list) || [];
    if(cntEl) cntEl.textContent = list.length ? '(' + list.length + ')' : '';
    if(!list.length){ listEl.innerHTML = '<small style="opacity:.6">还没有评论，来抢沙发</small>'; return; }
    const me = await myUid();
    const amAdmin = await isAdminUser();
    const ownerUid = list.length ? (list[0].ownerUid || '') : '';
    listEl.innerHTML = list.map(c => {
      const own = c.uid === me;
      const canDel = own || (me && ownerUid && me === ownerUid) || amAdmin;
      const ops = [];
      if(canDel) ops.push(`<text class="pd-cmt-del" onclick="delPostComment('${esc(c.cid)}', ${idx})">删除</text>`);
      if(!own) ops.push(`<text class="pd-cmt-rep" onclick="reportPostComment('${esc(c.cid)}')">举报</text>`);
      return `
      <div class="pd-cmt-item">
        <text class="pd-cmt-nick">${esc(c.nickname || '路过的朋友')}${c.isOp ? '<text class="pd-cmt-op">贴主</text>' : ''}</text>
        <text class="pd-cmt-txt">${esc(c.content)}</text>
        <text class="pd-cmt-time">${esc(c.time || '')}</text>
        ${ops.join('')}
      </div>`;
    }).join('');
  }catch(e){
    listEl.innerHTML = '<small style="opacity:.6">评论加载失败</small>';
  }
}
async function reportPostComment(cid){
  try{
    const r = await shareApi('commentReport', { cid });
    if(r && r.already) toast('你已举报过这条评论');
    else if(r && r.hiddenNow) toast('举报成功，该评论已被自动隐藏');
    else toast('举报成功，我们会尽快处理');
  }catch(e){ toast('举报失败'); }
}
async function sendPostComment(idx){
  const p = shareList[idx]; if(!p) return;
  const inp = document.getElementById('pdCmtInput');
  const content = inp ? inp.value.trim() : '';
  if(!content){ toast('先写点内容再发送'); return; }
  try{
    await shareApi('commentAdd', { id: p.id, content, nickname: (currentUser && currentUser.nickname) || '路过的朋友' });
    if(inp) inp.value = '';
    toast('评论已发送');
    loadPostComments(idx);
  }catch(e){ toast(e.message || '评论发送失败'); }
}
async function delPostComment(cid, idx){
  try{ await shareApi('commentDel', { cid }); loadPostComments(idx); }catch(e){ toast('删除失败'); }
}

/* ---------------- 添加到行程：跳事件编辑页，带入名称与备注 ---------------- */
async function addPostToTrip(idx){
  const p = shareList[idx]; if(!p) return;
  closePostDetail();
  await openEditor(null);
  const name = document.getElementById('fName');
  const note = document.getElementById('fNote');
  if(name) name.value = '行程';
  if(note) note.value = '去往' + (p.addr || p.name || '该地点');
  toast('已带入行程，补全时间就能保存');
}

/* ---------------- 图片预览（缩略图点开看全图） ---------------- */
function previewSharePhoto(idx, i){
  const p = shareList[idx];
  if(!p) return;
  const full = (p._full || [])[i];
  const src = full || (p.photos || [])[i];
  if(!src) return;
  document.getElementById('imgPreviewSrc').src = src;
  document.getElementById('imgPreview').style.display = 'flex';
  // 异步取全图（feed 里只带缩略图时）
  if(!full){
    shareApi('photo', { id: p.id, i })
      .then(r => {
        if(r && r.ok !== false && r.url){
          p._full = p._full || []; p._full[i] = r.url;
          if(document.getElementById('imgPreview').style.display !== 'none') document.getElementById('imgPreviewSrc').src = r.url;
        }
      })
      .catch(() => {});
  }
}
function closeImgPreview(){
  document.getElementById('imgPreview').style.display = 'none';
  document.getElementById('imgPreviewSrc').src = '';
}

/* ---------------- 发布 ---------------- */
function openPublish(){
  if(!(window.CloudAuth && CloudAuth.active())){ toast('云服务不可用'); return; }
  if(!(CloudAuth.currentUser && CloudAuth.currentUser())){ openLogin(); return; }
  pubPhotos = []; pubType = '美食';
  document.querySelectorAll('#typeRow .type-chip').forEach(c => c.classList.toggle('on', c.dataset.t === '美食'));
  document.getElementById('postNameInput').value = '';
  const addrInput = document.getElementById('postAddrInput');
  if(addrInput) addrInput.value = '';
  document.getElementById('postDescInput').value = '';
  renderPubIdentity();
  renderPhotoGrid();
  document.getElementById('publishOverlay').style.display = 'flex';
}
function closePublish(){ document.getElementById('publishOverlay').style.display = 'none'; }
function renderPubIdentity(){
  const row = document.getElementById('pubIdRow');
  if(!row) return;
  const a = currentUser && currentUser.avatar;
  const avatarHtml = (a && isDataUrl(a)) ? `<img class="id-avatar" src="${esc(a)}" />`
    : (a && isAvatarRef(a)) ? `<img class="id-avatar" data-avref="${esc(a)}" />`
    : '<text class="id-avatar id-avatar-ph">👤</text>';
  row.innerHTML = `${avatarHtml}
    <span class="id-info">
      <text class="id-nick">${esc((currentUser && currentUser.nickname) || '未设置身份')}</text>
      <text class="id-sub">${(currentUser && currentUser.nickname) ? '以这个身份发布 · 去「我的」可修改' : '去「我的」登录并完善资料'}</text>
    </span>`;
  const ref = a && isAvatarRef(a) ? a : null;
  if(ref) mediaGet(ref).then(d => { const im = row.querySelector('[data-avref]'); if(im && d) im.src = d; });
}
function renderPhotoGrid(){
  const grid = document.getElementById('photoGrid');
  if(!grid) return;
  grid.innerHTML = pubPhotos.map((ph, i) => `
    <div class="photo-cell">
      <img class="photo-img" src="${esc(ph.t)}" onclick="previewPubPhoto(${i})" />
      <span class="photo-del" onclick="removePubPhoto(${i})">✕</span>
    </div>`).join('') + (pubPhotos.length < 3 ? '<div class="photo-add" onclick="pickPostPhoto()">＋<text>添加</text></div>' : '');
}
function pickPostPhoto(){
  const input = document.getElementById('postPhotoFile');
  if(input) input.click();
}
function previewPubPhoto(i){ openImgPreviewDirect(pubPhotos[i].f || pubPhotos[i].t); }
function openImgPreviewDirect(src){
  document.getElementById('imgPreviewSrc').src = src;
  document.getElementById('imgPreview').style.display = 'flex';
}
function removePubPhoto(i){ pubPhotos.splice(i, 1); renderPhotoGrid(); }
function setPostType(t){
  pubType = t;
  document.querySelectorAll('#typeRow .type-chip').forEach(c => c.classList.toggle('on', c.dataset.t === t));
}
// 压缩为封面缩略图 + 展示全图（控制上传体积）
async function compressPostImage(file){
  const reader = new FileReader();
  const dataUrl = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file); });
  const draw = (maxSize, q) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      try{
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        res(canvas.toDataURL('image/jpeg', q));
      }catch(e){ rej(e); }
    };
    img.onerror = rej;
    img.src = dataUrl;
  });
  return { t: await draw(300, 0.6), f: await draw(1080, 0.72) };
}
async function onPostPhotoPicked(ev){
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if(!file) return;
  if(!file.type.startsWith('image/')){ toast('请选择图片文件'); return; }
  if(pubPhotos.length >= 3){ toast('最多 3 张照片'); return; }
  try{
    const pair = await compressPostImage(file);
    pubPhotos.push(pair);
    renderPhotoGrid();
  }catch(e){ toast('图片处理失败，请换一张试试'); }
}
/* ---------------- 官方默认配图（不选照片时按类型自动配一张） ---------------- */
function drawDefaultPhoto(kind, size){
  // 4:3 场景插画；kind ∈ 景点/美食/娱乐
  const w = size, h = Math.round(size * 0.75);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const R = w / 1080;
  let g;
  if(kind === '景点'){
    g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#8ed8f8'); g.addColorStop(.6, '#cdeffd'); g.addColorStop(1, '#e8f8e0');
  }else if(kind === '美食'){
    g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ffe29a'); g.addColorStop(1, '#ff9a62');
  }else{
    g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#f6a2ff'); g.addColorStop(1, '#7c5cff');
  }
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.textAlign = 'center';
  if(kind === '景点'){
    x.fillStyle = 'rgba(255,214,102,.95)';
    x.beginPath(); x.arc(w * .78, h * .22, 70 * R, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#7fb8a4';
    x.beginPath(); x.moveTo(0, h); x.lineTo(w * .28, h * .42); x.lineTo(w * .55, h); x.closePath(); x.fill();
    x.fillStyle = '#5f9e8c';
    x.beginPath(); x.moveTo(w * .38, h); x.lineTo(w * .68, h * .3); x.lineTo(w, h); x.closePath(); x.fill();
    x.font = Math.round(120 * R) + 'px serif'; x.fillText('🏞️', w * .5, h * .5);
  }else if(kind === '美食'){
    x.fillStyle = 'rgba(255,255,255,.92)';
    x.beginPath(); x.ellipse(w * .5, h * .56, 320 * R, 200 * R, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,138,76,.5)'; x.lineWidth = 10 * R;
    x.beginPath(); x.ellipse(w * .5, h * .56, 320 * R, 200 * R, 0, 0, Math.PI * 2); x.stroke();
    x.font = Math.round(140 * R) + 'px serif'; x.fillText('🍜', w * .5, h * .62);
  }else{
    const colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff'];
    for(let i = 0; i < 26; i++){
      x.fillStyle = colors[i % colors.length];
      x.globalAlpha = .75;
      x.beginPath(); x.arc(Math.random() * w, Math.random() * h, (8 + Math.random() * 22) * R, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    x.font = Math.round(140 * R) + 'px serif'; x.fillText('🎤', w * .5, h * .56);
  }
  x.font = 'bold ' + Math.round(56 * R) + 'px sans-serif';
  x.fillStyle = 'rgba(0,0,0,.5)';
  x.fillText(kind === '景点' ? '风景这边独好' : kind === '美食' ? '尝一口就知道' : '一起玩得开心', w * .5, h * .9);
  return c;
}
/* ---------------- 官方默认配图：打包高清实拍图（缺失时退回 canvas 插画） ---------------- */
const DEFAULT_ASSET = { '美食': 'food', '景点': 'scene', '娱乐': 'fun' };
async function assetDataUrl(name, size){
  const r = await fetch('app/assets/defaults/' + name + '@' + size + '.jpg');
  if(!r.ok) throw new Error('asset missing');
  const blob = await r.blob();
  return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
}
async function ensureDefaultPhoto(type){
  const kind = type === '景点' ? '景点' : type === '美食' ? '美食' : '娱乐';
  if(defaultPhotoCache[kind]) return defaultPhotoCache[kind];
  const asset = DEFAULT_ASSET[kind];
  try{
    const pair = await Promise.all([assetDataUrl(asset, 1080), assetDataUrl(asset, 300)]);
    defaultPhotoCache[kind] = { t: pair[1], f: pair[0] };
    return defaultPhotoCache[kind];
  }catch(e){
    const full = drawDefaultPhoto(kind, 1080).toDataURL('image/jpeg', 0.72);
    const thumb = drawDefaultPhoto(kind, 300).toDataURL('image/jpeg', 0.6);
    defaultPhotoCache[kind] = { t: thumb, f: full };
    return defaultPhotoCache[kind];
  }
}

/* ---------------- 地址选择弹层（省市区级联 + 镇/村详细 + 地图选点） ---------------- */
let divisions = null;       // [{code,name,children:[{code,name,children}]}]
let addrMap = null;         // Leaflet 实例
let addrMarker = null;
let mapLoading = false;

function loadDivisions(){
  if(divisions) return Promise.resolve(divisions);
  return fetch('app/assets/divisions.json').then(r => r.json()).then(d => { divisions = d; return d; });
}
function openAddrPicker(){
  document.getElementById('addrPicker').style.display = 'flex';
  const blk = document.getElementById('addrBlock');
  if(blk) blk.value = '';
  loadDivisions().then(d => {
    const sel = document.getElementById('selProv');
    const cur = sel.value;
    sel.innerHTML = '<option value="">省份</option>' + d.map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('');
    if(cur) sel.value = cur;
    if(!cur) onProvChange();
  }).catch(() => toast('地址数据加载失败'));
}
function closeAddrPicker(){ document.getElementById('addrPicker').style.display = 'none'; }
function onProvChange(){
  const p = (divisions || []).find(x => x.code === document.getElementById('selProv').value);
  const cs = p ? (p.children || []) : [];
  document.getElementById('selCity').innerHTML = '<option value="">城市</option>' + cs.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('');
  onCityChange();
}
function onCityChange(){
  const p = (divisions || []).find(x => x.code === document.getElementById('selProv').value);
  const c = p ? (p.children || []).find(x => x.code === document.getElementById('selCity').value) : null;
  const as = c ? (c.children || []) : [];
  document.getElementById('selArea').innerHTML = '<option value="">区县</option>' + as.map(a => `<option value="${esc(a.code)}">${esc(a.name)}</option>`).join('');
  onAreaChange();
}
function onAreaChange(){ updateAddrPreview(); }
function addrTownVal(){ return (document.getElementById('addrTown').value || '').trim(); }
function addrDetailVal(){ return (document.getElementById('addrDetail').value || '').trim(); }
function addrBlockVal(){ return (document.getElementById('addrBlock') ? document.getElementById('addrBlock').value : '').trim(); }

/* ---- 高德 Web 服务（逆地理 + 附近POI）----
   AMAP_WEB_KEY 在高德开放平台(lbs.amap.com)创建"Web服务"类型 Key 后填入；
   留空则自动回退原有 BigDataCloud/Nominatim 链路（精度较低）。 */
const AMAP_WEB_KEY = '6c6551e4b4386aa115db5bc121003d7c';

/* WGS-84(系统定位) → GCJ-02(高德/国内地图) 标准偏移算法 */
function wgs2gcj(lat, lng){
  const a = 6378245.0, ee = 0.00669342162296594323;
  const inChina = (lng, lat) => lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
  if(!inChina(lng, lat)) return { lat, lng };
  const dLat = (x, y) => -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x)) + (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3 + (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI)) * 2/3 + (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30)) * 2/3;
  const dLng = (x, y) => 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x)) + (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3 + (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI)) * 2/3 + (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x/30*Math.PI)) * 2/3;
  let d = dLat(lng - 105, lat - 35), m = dLng(lng - 105, lat - 35);
  const rad = lat / 180 * Math.PI;
  let magic = Math.sin(rad); magic = 1 - ee * magic * magic;
  const sqrt = Math.sqrt(magic);
  d = (d * 180) / ((a * (1 - ee)) / (magic * sqrt) * Math.PI);
  m = (m * 180) / (a / sqrt * Math.cos(rad) * Math.PI);
  return { lat: lat + d, lng: lng + m };
}

/* 高德逆地理（GCJ-02 输入）：省市区街 + 附近POI 列表 */
async function amapRegeo(lat, lng){
  if(!AMAP_WEB_KEY) throw new Error('no key');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  const url = 'https://restapi.amap.com/v3/geocode/regeo?key=' + AMAP_WEB_KEY + '&location=' + lng.toFixed(6) + ',' + lat.toFixed(6) + '&extensions=all&radius=1000&roadlevel=0';
  const r = await fetch(url, { signal: ctrl.signal });
  clearTimeout(timer);
  if(!r.ok) throw new Error('bad');
  const j = await r.json();
  if(!j || j.status !== '1' || !j.regeocode) throw new Error('amap: ' + ((j && j.info) || 'fail'));
  const comp = j.regeocode.addressComponent || {};
  const one = v => Array.isArray(v) ? (v[0] || '') : String(v || '');
  const prov = one(comp.province);
  const city = one(comp.city) || prov;   // 直辖市 city 为 []
  const area = one(comp.district);
  const town = one(comp.township);
  const street = (one(comp.street) + ' ' + one(comp.number)).trim();
  const pois = (j.regeocode.pois || []).slice(0, 10).map(p => ({
    name: String(p.name || ''),
    addr: String(p.address || ''),
    dist: Math.round(parseFloat(p.distance) || 0)
  }));
  return { prov, city, area, town, street, pois, detail: pois.length ? pois[0].name : street, allNames: [prov, city, area, town].filter(Boolean), src: 'amap' };
}
function addrName(code, list){
  const it = (list || []).find(x => x.code === code);
  return it ? it.name : '';
}
function updateAddrPreview(){
  const pv = document.getElementById('addrPreview');
  if(!pv) return;
  const t = composeAddr();
  pv.textContent = '地址预览：' + (t || '—');
}
function composeAddr(){
  const provCode = document.getElementById('selProv').value;
  const cityCode = document.getElementById('selCity').value;
  const areaCode = document.getElementById('selArea').value;
  if(!provCode || !cityCode || !areaCode) return '';
  const prov = addrName(provCode, divisions);
  const provObj = (divisions || []).find(x => x.code === provCode);
  const cityRaw = (provObj ? (provObj.children || []).find(x => x.code === cityCode) : null);
  const city = cityRaw ? addrName(cityCode, provObj.children) : '';
  const area = cityRaw ? addrName(areaCode, cityRaw.children || []) : '';
  const town = addrTownVal();
  let detail = addrDetailVal();
  const block = addrBlockVal();
  if(detail && block) detail = (detail + ' ' + block).slice(0, 60);
  if(!prov || !area || !detail) return '';
  return [prov, cityRaw && (cityRaw.name === '市辖区' || cityRaw.name === '县') ? '' : city, area, town, detail].filter(Boolean).join('');
}
async function confirmAddrPick(){
  const provCode = document.getElementById('selProv').value;
  const cityCode = document.getElementById('selCity').value;
  const areaCode = document.getElementById('selArea').value;
  if(!provCode){ toast('请选择省份'); return; }
  if(!cityCode){ toast('请选择城市'); return; }
  if(!areaCode){ toast('请选择区县'); return; }
  if(!addrDetailVal()){ toast('请填写详细地址（村/小区/楼栋/门牌号）'); return; }
  const addr = composeAddr();
  if(!addr){ toast('地址不完整，请检查选择'); return; }
  document.getElementById('postAddrInput').value = addr;
  document.getElementById('postAddrInput').dataset.valid = '1';
  closeAddrPicker();
  toast('地址已填入');
}
/* ---- 地图选点（独立弹层：实时定位 + 点选修正） ---- */
let pickMapInited = false;
function openMapPicker(){
  document.getElementById('mapPicker').style.display = 'flex';
  setTimeout(initPickMap, 60);
}
function closeMapPicker(){ document.getElementById('mapPicker').style.display = 'none'; }
function initPickMap(){
  const tip = document.getElementById('pickTip');
  if(pickMapInited){
    try{ addrMap.invalidateSize(); }catch(e){}
    locateForAddrMap();
    return;
  }
  try{
    addrMap = L.map('pickMap', { zoomControl: false }).setView([34.0, 108.0], 4);
    // 高德瓦片（国内可达）为主，OSM 兜底
    const amap = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', { subdomains: ['1', '2', '3', '4'], maxZoom: 18 });
    let osmAdded = false;
    amap.on('tileerror', () => {
      if(!osmAdded){ osmAdded = true; try{ L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(addrMap); }catch(e){} }
    });
    amap.addTo(addrMap);
    addrMarker = L.marker([34.0, 108.0], { draggable: true, icon: L.divIcon({ className: 'pin-wrap', html: '<div class="pin-marker"></div>', iconSize: [36, 36], iconAnchor: [18, 34] }) }).addTo(addrMap);
    addrMarker.on('dragend', () => reversePick(addrMarker.getLatLng()));
    addrMap.on('click', e => { addrMarker.setLatLng(e.latlng); reversePick(e.latlng); });
    pickMapInited = true;
    if(tip) tip.style.display = 'none';
    addrMap.invalidateSize();
    setTimeout(() => { try{ addrMap.invalidateSize(); }catch(e){} }, 350);
    locateForAddrMap();
  }catch(e){
    if(tip) tip.textContent = '地图初始化失败，请手动填写地址';
  }
}
function setPickTip(t){
  const tip = document.getElementById('pickTip');
  if(!tip) return;
  tip.textContent = t;
  tip.style.display = t ? 'block' : 'none';
}
function getCoords(){
  // 优先高德融合定位 SDK（GCJ-02，误差 5-50m）；失败回退系统定位（WGS-84，国内网络定位误差大）
  const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AmapLocation;
  if(A){
    return (async () => {
      try{
        // 高德 SDK 在异常场景（key 无效/室内无信号）可能长时间不回调，18s 强制超时回退
        const pos = await Promise.race([
          A.getCurrentLocation({ timeout: 15000 }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('AMAP_TIMEOUT')), 18000))
        ]);
        if(pos && pos.lat) return { lat: pos.lat, lon: pos.lon, gcj: true, accuracy: pos.accuracy };
      }catch(e){ /* 回退 */ }
      const G = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
      if(!G) throw new Error('no geo');
      let st = null;
      if(G.checkPermissions){ st = await G.checkPermissions(); }
      const state = st ? (st.location || st.coarseLocation) : null;
      if(state === 'denied') throw new Error('PERM_DENIED');
      if(state === 'prompt' || state === 'prompt-with-rationale' || !state){
        if(G.requestPermissions){ await G.requestPermissions(); }
      }
      const pos = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      return { lat: pos.coords.latitude, lon: pos.coords.longitude, gcj: false };
    })();
  }
  const G = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
  if(G){
    // 原生插件路径：先检查/请求权限（Capacitor 8 不会自动弹授权框）
    return (async () => {
      try{
        let st = null;
        if(G.checkPermissions){ st = await G.checkPermissions(); }
        const state = st ? (st.location || st.coarseLocation) : null;
        if(state === 'denied') throw new Error('PERM_DENIED');
        if(state === 'prompt' || state === 'prompt-with-rationale' || !state){
          if(G.requestPermissions){ await G.requestPermissions(); }
        }
        const pos = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
        return { lat: pos.coords.latitude, lon: pos.coords.longitude, gcj: false };
      }catch(e){
        throw (e && e.message === 'PERM_DENIED') ? e : e;
      }
    })();
  }
  if(navigator.geolocation){
    return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, gcj: false }),
      rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }));
  }
  return Promise.reject(new Error('no geo'));
}
async function locateForAddrMap(){
  setPickTip('定位中…');
  let c = null;
  try{ c = await getCoords(); }catch(e){ c = null; }
  if(!c){
    setPickTip('定位失败：请在系统设置中允许绸缪使用位置权限，或直接点击地图选点');
    return;
  }
  // 高德底图是 GCJ-02：系统定位(WGS-84)必须先偏移转换，否则点/标记整体偏移数百米
  const ll = c.gcj ? [c.lat, c.lon] : (() => { const g = wgs2gcj(c.lat, c.lon); return [g.lat, g.lng]; })();
  if(addrMap){ addrMap.setView(ll, c.gcj ? 17 : 16); addrMarker.setLatLng(ll); }
  setPickTip('');
  reversePick({ lat: ll[0], lng: ll[1] });
}
async function photonDetail(ll){
  // Photon(OpenStreetMap) 补充路名/POI 作为详细地址
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const r = await fetch('https://photon.komoot.io/reverse?lat=' + ll.lat + '&lon=' + ll.lng + '&lang=default', { signal: ctrl.signal });
  clearTimeout(timer);
  if(!r.ok) throw new Error('bad');
  const j = await r.json();
  const f = (j.features && j.features[0] && j.features[0].properties) || {};
  let detail = '';
  if(f.street){ detail = String(f.street) + (f.housenumber ? String(f.housenumber) : ''); }
  else if(f.name && f.osm_key !== 'place'){ detail = String(f.name); }
  return detail;
}
async function bdcReverse(ll){
  // BigDataCloud 免费逆地理（国内可达，返回中文）
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + ll.lat + '&longitude=' + ll.lng + '&localityLanguage=zh', { signal: ctrl.signal });
  clearTimeout(timer);
  if(!r.ok) throw new Error('bad');
  const j = await r.json();
  const adm = (j.localityInfo && j.localityInfo.administrative) || [];
  const allNames = adm.map(x => String(x.name || '')).filter(Boolean);
  const lvl = (lo, hi) => { const x = adm.find(v => v.adminLevel >= lo && v.adminLevel <= hi); return x ? String(x.name || '') : ''; };
  const prov = j.principalSubdivision || lvl(4, 5) || '';
  const city = lvl(4, 7) !== prov ? (lvl(5, 7) || j.city || '') : (j.city || '');
  const area = j.locality && j.locality !== city ? j.locality : (allNames.length >= 3 ? allNames[allNames.length - 2] : '');
  const deepest = allNames.length ? allNames[allNames.length - 1] : '';
  const town = deepest && deepest !== prov && deepest !== city && deepest !== area ? deepest : '';
  const detail = String(j.street || '');
  return { prov, city, area, town, detail, allNames };
}
async function nominatimReverse(ll){
  // 海外网络兜底
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + ll.lat + '&lon=' + ll.lng + '&accept-language=zh-CN&zoom=18', { signal: ctrl.signal });
  clearTimeout(timer);
  if(!r.ok) throw new Error('bad');
  const j = await r.json();
  const a = j.address || {};
  const town = a.county && (a.county.indexOf('镇') >= 0 || a.county.indexOf('街道') >= 0 || a.county.indexOf('乡') >= 0) ? a.county : (a.suburb || a.village || '');
  return { prov: a.state || a.province || '', city: a.city || a.town || '', area: a.county || a.district || a.suburb || '', town: String(town), detail: [a.road, a.neighbourhood, a.house_number].filter(Boolean).join('') };
}
let nearPois = [];
function renderNearList(pois){
  nearPois = pois || [];
  const box = document.getElementById('nearList');
  if(!box) return;
  if(!nearPois.length){ box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  box.innerHTML = '<div class="near-head">📍 附近地点（点击选为详细地址）</div>' +
    nearPois.map((p, i) => `
    <div class="near-item" onclick="nearPick(${i})">
      <b>${esc(p.name)}</b><small>${esc(p.addr || '')}${p.dist ? ' · 约' + p.dist + '米' : ''}</small>
    </div>`).join('');
}
function nearPick(i){
  const p = nearPois[i];
  if(!p) return;
  const det = document.getElementById('addrDetail');
  if(det && p.name) det.value = String(p.name).slice(0, 60);
  updateAddrPreview();
  closeMapPicker();
  toast('已选「' + String(p.name).slice(0, 12) + '」，可补充楼栋单元后确定');
}
async function reversePick(ll){
  setPickTip('解析选点地址…');
  let n = null;
  // 高德优先（GCJ-02 数据 + POI 级精度）；无 key 或失败回退 BDC/Nominatim
  try{ n = await amapRegeo(ll.lat, ll.lng); }catch(e){ n = null; }
  renderNearList(n && n.pois ? n.pois : []);
  if(!n){ try{ n = await bdcReverse(ll); }catch(e){ n = null; } }
  if(!n || !n.prov){ try{ n = await nominatimReverse(ll); }catch(e){ n = null; } }
  if(!n || !n.prov){ setPickTip('选点解析失败，请手动填写详细地址'); return; }
  // 详细地址：Photon 路名/POI 优先（仅兜底链路需要；高德已带 POI），避免与已用的镇街/区县重名
  if(!n.src || n.src !== 'amap'){
    try{
      const ph = await photonDetail(ll);
      if(ph && ph !== n.town && ph !== n.area && ph !== n.city) n.detail = ph;
    }catch(e){}
  }
  try{
    await loadDivisions();
    const provName = n.prov;
    const prov = (divisions || []).find(p => provName && (p.name === provName || p.name.indexOf(provName) >= 0 || provName.indexOf(p.name.replace(/[省市自治区]$/, '')) >= 0));
    if(prov){
      document.getElementById('selProv').value = prov.code;
      onProvChange();
      // 层级名逐级对号：先精确，再词干等值（常熟市↔常熟），避免"苏州工业园区"误吸"苏州市"
      const nameList = (n.allNames || []).concat([n.city, n.area, n.town]).filter(Boolean);
      const hit2 = (list) => {
        let r = null;
        for(const nm of nameList){ r = (list || []).find(x => x.name === nm); if(r) return r; }
        for(const nm of nameList){
          const stem = nm.replace(/区|县|市$/, '');
          if(!stem) continue;
          r = (list || []).find(x => x.name === stem || x.name.replace(/区|县|市$/, '') === stem);
          if(r) return r;
        }
        return null;
      };
      let city = hit2(prov.children);
      // 直辖市：pca 结构为 北京→市辖区→区县
      if(!city && prov.children && prov.children.length === 1 && prov.children[0].name.indexOf('市辖区') >= 0){
        city = prov.children[0];
      }
      if(city){
        document.getElementById('selCity').value = city.code;
        onCityChange();
        const area = hit2(city.children);
        if(area) document.getElementById('selArea').value = area.code;
      }
      if(n.town) document.getElementById('addrTown').value = String(n.town).slice(0, 20);
      if(n.detail) document.getElementById('addrDetail').value = String(n.detail).slice(0, 60);
      updateAddrPreview();
      setPickTip('已按选点填入，可返回调整或点"使用该位置"');
    } else {
      setPickTip('该位置不在国内行政区划内，请手动选择省市后填写');
    }
  }catch(e){
    setPickTip('选点解析失败，请手动填写详细地址');
  }
}
function useMapPick(){
  closeMapPicker();
  toast('选点已填入地址，确认无误后点"确定使用该地址"');
}

// 发布请求体上限约 95KB(实测 90KB 过/100KB 413) → 上传前把照片压进预算
const PUB_BODY_BUDGET = 78 * 1024;
function shrinkDataUrl(dataUrl, width, q){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      try{
        const h = Math.max(1, Math.round(img.height * width / img.width));
        const c = document.createElement('canvas'); c.width = width; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, width, h);
        res(c.toDataURL('image/jpeg', q));
      }catch(e){ rej(e); }
    };
    img.onerror = rej;
    img.src = dataUrl;
  });
}
async function fitPhotosForUpload(photos){
  const isData = u => String(u).indexOf('data:') === 0;
  const calc = () => photos.reduce((s, p) => s + p.t.length + p.f.length, 0) + 2048;
  let out = photos;
  if(calc() <= PUB_BODY_BUDGET) return out;
  const widths = [960, 820, 700, 600, 520, 440];
  for(const w of widths){
    const q = w >= 700 ? 0.7 : 0.62;
    const next = [];
    for(const p of out){ next.push({ t: p.t, f: isData(p.f) ? await shrinkDataUrl(p.f, w, q) : p.f }); }
    out = next;
    if(calc() <= PUB_BODY_BUDGET) return out;
  }
  const last = [];
  for(const p of out){ last.push({ t: await shrinkDataUrl(p.t, 240, 0.6), f: isData(p.f) ? await shrinkDataUrl(p.f, 380, 0.55) : p.f }); }
  return last;
}
// 全图分片上传（绕开单请求 95KB 上限）：成功返回引用 '@m:<mid>'，失败返回原 dataURL
async function mediaUploadDataUrl(dataUrl){
  const raw = String(dataUrl || '');
  if(raw.indexOf('@m:') === 0) return raw;
  const b64 = raw.indexOf('base64,') >= 0 ? raw.slice(raw.indexOf('base64,') + 7) : raw;
  const mid = 'm_' + uid();
  const CHUNK = 48 * 1024;
  const total = Math.max(1, Math.ceil(b64.length / CHUNK));
  for(let i = 0; i < total; i++){
    const r = await shareApi('mediaPut', { mid, i, n: total, c: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
    if(!r || r.ok === false) throw new Error((r && r.error) || '分片上传失败');
  }
  return '@m:' + mid;
}
const DEFAULT_MEDIA_KEY = 'shiguang_defmedia';
function loadDefaultMediaMap(){ try{ return JSON.parse(localStorage.getItem(DEFAULT_MEDIA_KEY) || '{}'); }catch(e){ return {}; } }
async function mediaUploadForPublish(photos){
  const out = [];
  for(const x of photos){
    let f = x.f;
    if(f.indexOf('data:') === 0){
      try{ f = await mediaUploadDataUrl(f); }
      catch(e){ /* 上传失败保留 dataURL，由预算压缩兜底 */ }
    }
    out.push({ t: x.t, f });
  }
  return out;
}
async function doPublish(){
  if(!(window.CloudAuth && CloudAuth.active())){ toast('云服务暂不可用，请稍后再试'); return; }
  if(!(CloudAuth.currentUser && CloudAuth.currentUser())){ toast('还差一步：请先登录后再发布'); openLogin(); return; }
  const name = (document.getElementById('postNameInput').value || '').trim();
  const addrInput = document.getElementById('postAddrInput');
  const addr = (addrInput.value || '').trim();
  const desc = (document.getElementById('postDescInput').value || '').trim();
  if(!addr || addrInput.dataset.valid !== '1'){
    toast('还差一步：点击"填写"选择规范地址（省市区+详细地址必填）');
    openAddrPicker();
    return;
  }
  if(/https?:\/\/|www\./i.test(addr) || /^\d+$/.test(addr)){ toast('地址格式不合规，请填写真实地址'); return; }
  if(/加微信|赌博|代开发票|色情|约炮|刷单|高利贷/.test(name + addr + desc)){ toast('内容含违规词，请修改后再发布'); return; }
  const btn = document.getElementById('publishBtn');
  btn.disabled = true; btn.textContent = '发布中…';
  try{
    let photos = pubPhotos;
    if(!photos.length){
      // 未选照片：按类型自动配一张官方图（首次上传后缓存引用，之后秒传）
      const def = await ensureDefaultPhoto(pubType);
      const map = loadDefaultMediaMap();
      const key = pubType === '景点' ? 'scene' : (pubType === '娱乐' ? 'fun' : 'food');
      photos = map[key] ? [{ t: def.t, f: '@m:' + map[key] }] : [def];
    }
    // 全图走分片上传转引用（保持原画质），缩略图内联；预算压缩只兜底
    photos = await mediaUploadForPublish(photos);
    photos = await fitPhotosForUpload(photos);
    try{
      if(photos.length === 1 && String(photos[0].f).indexOf('@m:') === 0 && !pubPhotos.length){
        const key = pubType === '景点' ? 'scene' : (pubType === '娱乐' ? 'fun' : 'food');
        const map = loadDefaultMediaMap();
        if(!map[key]){ map[key] = String(photos[0].f).slice(3); try{ localStorage.setItem(DEFAULT_MEDIA_KEY, JSON.stringify(map)); }catch(e){} }
      }
    }catch(e){}
    // 头像随发布一并上云（自愈：即使此前头像云同步失败，发布也会补上）
    let avatarForCloud = null;
    try{ avatarForCloud = await avatarDataUrl(); }catch(e){}
    const r = await shareApi('publish', { post: {
      type: pubType, name, addr, desc,
      photos: photos.map(x => ({ t: x.t, f: x.f })),
      nickname: (currentUser && currentUser.nickname) || '路过的朋友',
      avatar: avatarForCloud || '',
    }});
    if(!r || r.ok === false) throw new Error(r && r.error || '发布失败');
    toast('发布成功');
    closePublish();
    shareTab = 'feed'; shareList = []; sharePage = 0; shareHasMore = true;
    const f = document.getElementById('segFeed'), m = document.getElementById('segMine');
    if(f && m){ f.classList.add('seg-on'); m.classList.remove('seg-on'); }
    loadShare(true);
  }catch(e){
    toast(e.message || '发布失败');
  }finally{
    btn.disabled = false; btn.textContent = '发布';
  }
}
