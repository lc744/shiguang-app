// 绸缪 · 分享页（与小程序 share/publish 页一致）
// 大家的推荐 / 我的发布 双分段；发布（照片≤3、类型、名称、推荐理由）；点赞、删除、举报
// 云端：profileApi 云函数（PG 存储）；未登录时引导登录，云不可用时提示
const SHARE_TYPES = ['餐厅', '景点', '其他'];
let shareTab = 'feed';
let shareList = [];
let sharePage = 0;
let shareHasMore = true;
let shareLoading = false;
let shareLoadedOnce = false;
let pubPhotos = [];      // [{t: 缩略图, f: 全图}]
let pubType = '餐厅';

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

async function loadShare(reset){
  if(shareLoading) return;
  if(!(window.CloudAuth && CloudAuth.active())){
    // init 可能尚未完成：等待探测结束后重判一次
    try{ if(window.CloudAuth) await CloudAuth.init(); }catch(e){}
    if(!(window.CloudAuth && CloudAuth.active())){ renderShareError('云服务不可用，稍后再试'); return; }
  }
  if(!(CloudAuth.currentUser && CloudAuth.currentUser())){ renderShareError('登录后即可浏览与发布分享'); return; }
  shareLoading = true;
  const loadingEl = document.getElementById('shareLoading');
  if(loadingEl) loadingEl.style.display = 'block';
  shareApi(shareTab === 'feed' ? 'feed' : 'mine', { page: reset ? 0 : sharePage })
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
function renderShareError(msg){
  shareList = [];
  renderShareList(msg);
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
  document.getElementById('shareEmptyText').textContent = shareTab === 'feed' ? '还没有人分享，来当第一个' : '你还没有发布过';
  if(!shareList.length){
    box.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  box.innerHTML = shareList.map(p => {
    const photos = (p.photos || []);
    const photoHtml = photos.length ? `
      <div class="post-photos ${photos.length === 1 ? 'single' : ''}">
        ${photos.map((ph, i) => `<img class="post-photo" src="${esc(ph)}" loading="lazy" onclick="previewSharePhoto(${p._idx}, ${i})" />`).join('')}
      </div>` : '';
    return `
      <div class="post-card card">
        ${photoHtml}
        <div class="post-body">
          <div class="post-head"><text class="post-type">${esc(p.type || '其他')}</text><text class="post-name">${esc(p.name || '')}</text></div>
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
  // 给每条记录记下数组下标，供预览取全图
  shareList.forEach((p, i) => { p._idx = i; });
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
  pubPhotos = []; pubType = '餐厅';
  document.querySelectorAll('#typeRow .type-chip').forEach(c => c.classList.toggle('on', c.dataset.t === '餐厅'));
  document.getElementById('postNameInput').value = '';
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
async function doPublish(){
  if(!(window.CloudAuth && CloudAuth.active())){ toast('云服务不可用'); return; }
  if(!(CloudAuth.currentUser && CloudAuth.currentUser())){ openLogin(); return; }
  const name = (document.getElementById('postNameInput').value || '').trim();
  const desc = (document.getElementById('postDescInput').value || '').trim();
  if(!name){ toast('请填写名称'); return; }
  if(!pubPhotos.length){ toast('至少上传一张照片'); return; }
  const btn = document.getElementById('publishBtn');
  btn.disabled = true; btn.textContent = '发布中…';
  try{
    const r = await shareApi('publish', { post: {
      type: pubType, name, desc,
      photos: pubPhotos.map(x => ({ t: x.t, f: x.f })),
      nickname: (currentUser && currentUser.nickname) || '路过的朋友',
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
