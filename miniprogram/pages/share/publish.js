// 绸缪 v2 · 发布页：头像昵称填写能力 + 选图（压缩）+ 云存储上传 + postApi 发布（微信云开发）
const ID_KEY = 'shiguang_share_identity';
const EXT_MAP = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function getIdentity(){ try{ return wx.getStorageSync(ID_KEY) || {}; }catch(e){ return {}; } }

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    type: '美食',
    types: ['美食', '景点', '娱乐'],
    name: '',
    desc: '',
    city: '',
    region: [],
    addr: '',
    photos: [],
    fullPhotos: [],
    uploading: false
  },

  onLoad(){
    const id = getIdentity();
    const hasProfile = !!(id && id.nickname);
    this.setData({ nickname: id.nickname || '', avatarUrl: id.avatarUrl || '', hasProfile });
  },

  goMe(){ wx.switchTab({ url: '/pages/me/me' }); },

  onNickname(e){ this.setData({ nickname: e.detail.value || '' }); },

  onChooseAvatar(e){
    // 头像昵称填写能力：返回临时路径，发布时统一上传云存储持久化
    this.setData({ avatarUrl: e.detail.avatarUrl || '' });
  },

  setType(e){ this.setData({ type: e.currentTarget.dataset.t }); },

  // 省市区选择：取城市名（直辖市取市名；普通市取第二段"xx市"）
  onRegion(e){
    const v = (e.detail && e.detail.value) || [];
    const city = (v[1] || '').replace(/市辖区|县/g, '') || (v[0] || '');
    this.setData({ region: v, city });
  },

  onAddr(e){ this.setData({ addr: e.detail.value }); },

  // 地图选点（对齐安卓地图选址：微信原生地图，定位+搜索+附近POI，免费无需key）
  chooseAddr(){
    wx.chooseLocation({
      success: res => {
        const name = String(res.name || '').trim();
        const address = String(res.address || '').trim();
        const addr = name && address.indexOf(name) < 0 ? name + '，' + address : (address || name);
        this.setData({ addr });
        // 名称未填时用地点名回填（对齐安卓选点后顺带填名的体验）
        if(!this.data.name.trim() && name){ this.setData({ name: name.slice(0, 30) }); }
        // 经纬度反查省市区（云函数代理高德逆地理），自动回填所在城市
        if(!(wx.cloud && wx.cloud.callFunction)) return;
        wx.showLoading({ title: '识别城市中…', mask: false });
        wx.cloud.callFunction({
          name: 'postApi',
          data: { action: 'regeo', lat: res.latitude, lng: res.longitude }
        }).then(r => {
          wx.hideLoading();
          const out = r && r.result;
          if(out && out.ok && out.city && !this.data.city){
            this.setData({ city: out.city });
            wx.showToast({ title: '已识别城市：' + out.city, icon: 'none' });
          }
        }).catch(() => wx.hideLoading());
      },
      fail: err => {
        if(err && err.errMsg && err.errMsg.indexOf('auth') >= 0){
          wx.showModal({ title: '需要位置权限', content: '请在设置中允许使用位置信息', confirmText: '去设置', success: s => { if(s.confirm) wx.openSetting(); } });
        }
      }
    });
  },

  onName(e){ this.setData({ name: e.detail.value }); },
  onDesc(e){ this.setData({ desc: e.detail.value }); },

  pickPhotos(){
    const remain = 3 - this.data.photos.length;
    if(remain <= 0){ wx.showToast({ title: '最多 3 张照片', icon: 'none' }); return; }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: res => {
        // 双档：显示版(1280px/q60,列表详情省流) + 高清版(1920px/q80,点击看原图时取)
        const tasks = res.tempFiles.map(f => Promise.all([
          wx.compressImage({ src: f.tempFilePath, quality: 60, compressedWidth: 1280 })
            .then(r => r.tempFilePath).catch(() => f.tempFilePath),
          wx.compressImage({ src: f.tempFilePath, quality: 80, compressedWidth: 1920 })
            .then(r => r.tempFilePath).catch(() => f.tempFilePath)
        ]));
        Promise.all(tasks).then(pairs => {
          this.setData({
            photos: this.data.photos.concat(pairs.map(x => x[0])).slice(0, 3),
            fullPhotos: (this.data.fullPhotos || []).concat(pairs.map(x => x[1])).slice(0, 3)
          });
        });
      }
    });
  },

  removePhoto(e){
    const i = e.currentTarget.dataset.i;
    const photos = this.data.photos.slice();
    const fullPhotos = (this.data.fullPhotos || []).slice();
    photos.splice(i, 1);
    if(fullPhotos.length) fullPhotos.splice(i, 1);
    this.setData({ photos, fullPhotos });
  },

  previewPhoto(e){
    wx.previewImage({ urls: this.data.photos, current: this.data.photos[e.currentTarget.dataset.i] });
  },

  // 大图先压到阈值内（逐级降质量/宽度，最多 3 轮）：显示版 100KB（文档 512KB 上限），高清版 280KB
  _ensureSmall(path, limitBytes){
    const fsm = wx.getFileSystemManager();
    const sizeOf = p => new Promise(r => fsm.getFileInfo({ filePath: p, success: x => r(x.size), fail: () => r(0) }));
    const LIMIT = limitBytes || 100 * 1024;
    return sizeOf(path).then(size => {
      if(!size || size <= LIMIT) return path;
      let quality = 70, width = 1440;
      const step = attempt => wx.compressImage({ src: path, quality: quality, compressedWidth: width })
        .then(r => sizeOf(r.tempFilePath).then(s2 => (s2 && s2 <= LIMIT) || attempt >= 3 ? r.tempFilePath : (quality -= 20, width = Math.floor(width * 0.8), step(attempt + 1))))
        .catch(() => path);
      return step(0);
    });
  },

  _upload(localPath, dir, isFull){
    return this._ensureSmall(localPath, isFull ? 280 * 1024 : 100 * 1024).then(p2 => {
      const m = /\.([a-z0-9]+)$/i.exec(p2);
      const ext = (m && EXT_MAP[m[1].toLowerCase()]) ? m[1].toLowerCase() : 'jpg';
      return wx.cloud.uploadFile({
        cloudPath: dir + '/' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '.' + ext,
        filePath: p2
      }).then(r => r.fileID);
    });
  },

  // 对齐 App：优先上传打包高清实拍图（与安卓 app/assets/defaults 同一张），失败退 canvas 插画
  _ensureDefaultPhoto(type){
    const asset = type === '景点' ? 'scene' : type === '美食' ? 'food' : 'fun';
    const key = 'shiguang_defphoto_' + asset;
    try{ const cached = wx.getStorageSync(key); if(cached) return Promise.resolve(cached); }catch(e){}
    return wx.cloud.uploadFile({
      cloudPath: 'defaults/def_' + asset + '_' + Date.now() + '.jpg',
      filePath: '/images/defaults/' + asset + '.jpg'
    }).then(up => {
      try{ wx.setStorageSync(key, up.fileID); }catch(e){}
      return up.fileID;
    }).catch(() => this._canvasDefaultPhoto(type));
  },

  // 兜底：canvas 渐变插画（与安卓 drawDefaultPhoto 同款风格）
  _canvasDefaultPhoto(type){
    const kind = type === '景点' ? '景点' : type === '美食' ? '美食' : '娱乐';
    const key = 'shiguang_defphoto_canvas_' + kind;
    try{ const cached = wx.getStorageSync(key); if(cached) return Promise.resolve(cached); }catch(e){}
    return new Promise(resolve => {
      const q = wx.createSelectorQuery();
      q.select('#defcanvas').fields({ node: true, size: true }).exec(res => {
        if(!res || !res[0] || !res[0].node){ resolve(''); return; }
        const canvas = res[0].node;
        const w = 960, h = 720;
        canvas.width = w; canvas.height = h;
        const x = canvas.getContext('2d');
        let g;
        if(kind === '景点'){ g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#8ed8f8'); g.addColorStop(.6, '#cdeffd'); g.addColorStop(1, '#e8f8e0'); }
        else if(kind === '美食'){ g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ffe29a'); g.addColorStop(1, '#ff9a62'); }
        else { g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#f6a2ff'); g.addColorStop(1, '#7c5cff'); }
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.textAlign = 'center';
        if(kind === '景点'){
          x.fillStyle = 'rgba(255,214,102,.95)';
          x.beginPath(); x.arc(w * .78, h * .22, 62, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#7fb8a4';
          x.beginPath(); x.moveTo(0, h); x.lineTo(w * .3, h * .45); x.lineTo(w * .58, h); x.closePath(); x.fill();
          x.beginPath(); x.moveTo(w * .42, h); x.lineTo(w * .72, h * .55); x.lineTo(w, h); x.closePath(); x.fill();
        }
        x.font = '300px sans-serif';
        x.fillText(kind === '美食' ? '🍜' : (kind === '景点' ? '🏞' : '🎡'), w / 2, h / 2 + 105);
        x.fillStyle = 'rgba(0,0,0,.32)';
        x.font = 'bold 44px sans-serif';
        x.fillText('绸缪 · ' + kind + '推荐', w / 2, h - 60);
        wx.canvasToTempFilePath({
          canvas,
          success: r => {
            wx.cloud.uploadFile({ cloudPath: 'defaults/def_' + kind + '_' + Date.now() + '.jpg', filePath: r.tempFilePath })
              .then(up => { try{ wx.setStorageSync(key, up.fileID); }catch(e){} resolve(up.fileID); })
              .catch(() => resolve(''));
          },
          fail: () => resolve('')
        });
      });
    });
  },

  doPublish(){
    if(this.data.uploading) return;
    if(!this.data.hasProfile){ wx.showToast({ title: '先到「我的」登录并完善资料', icon: 'none', duration: 2200 }); return; }
    const name = this.data.name.trim();
    const desc = this.data.desc.trim();
    const nickname = (this.data.nickname || '').trim() || '路过的朋友';
    if(!this.data.city){ wx.showToast({ title: '选一下所在城市', icon: 'none' }); return; }
    if(!this.data.addr.trim()){ wx.showToast({ title: '还差一步：点击"填写"选择规范地址', icon: 'none', duration: 2200 }); return; }
    // 照片选填（对齐安卓：未选时自动按类型配默认图）

    this.setData({ uploading: true });
    wx.showLoading({ title: '发布中…', mask: true });

    const jobs = [];
    if(this.data.avatarUrl && !/^cloud:\/\//.test(this.data.avatarUrl)){
      jobs.push(this._upload(this.data.avatarUrl, 'avatars').then(id => { this.data.avatarUrl = id; }).catch(() => {}));
    }
    let photoList = this.data.photos;
    let fullList = (this.data.fullPhotos || []).slice();
    // 无图时不做前端默认图（真机从包内上传不可靠）：后端会按类型自动补官方默认图
    if(photoList.length){
      // 关键：上传结果必须回填 photoList（此前上传的 cloud:// fileID 被丢弃，导致永远降级默认图）
      photoList.forEach((p, i) => jobs.push(
        this._upload(p, 'posts').then(id => { photoList[i] = id; }).catch(() => {})
      ));
      // 高清版同步上传（点击查看原图用；失败不影响发布）
      fullList.forEach((p, i) => jobs.push(
        this._upload(p, 'posts_full', true).then(id => { fullList[i] = id; }).catch(() => {})
      ));
    }
    Promise.all(jobs)
      .then(() => {
        // 此时 photoList 已是 cloud:// fileID（上传成功）或原路径（失败，将被过滤）
        return {
          photos: photoList.map(String).filter(p => /^cloud:\/\//.test(p)),
          fullPhotos: fullList.map(String).filter(p => /^cloud:\/\//.test(p))
        };
      })
      .then(lists => {
        try{ wx.setStorageSync(ID_KEY, { nickname, avatarUrl: this.data.avatarUrl }); }catch(e){}
        const finalName = name || this.data.addr.trim() || (this.data.type + '推荐');
        return wx.cloud.callFunction({
          name: 'postApi', timeout: 60000,
          data: { action: 'publish', post: { nickname, avatarUrl: this.data.avatarUrl, type: this.data.type, name: finalName, desc, city: this.data.city, addr: this.data.addr, photos: lists.photos, fullPhotos: lists.fullPhotos } }
        }).then(r => r.result);
      })
      .then(r => {
        wx.hideLoading();
        if(r && r.ok){
          wx.showToast({ title: '发布成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 700);
        }else{
          console.error('[publish-fail]', (r && r.error) || '无返回');
          wx.showToast({ title: (r && r.error) || '发布失败', icon: 'none', duration: 2500 });
          this.setData({ uploading: false });
        }
      })
      .catch(e => {
        wx.hideLoading();
        console.error('[publish-err]', e.message);
        wx.showToast({ title: e.message || '发布失败', icon: 'none', duration: 2500 });
        this.setData({ uploading: false });
      });
  }
});
