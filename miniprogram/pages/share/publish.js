// 绸缪 v2 · 发布页：头像昵称填写能力 + 选图（压缩）+ 云存储上传 + postApi 发布
const ID_KEY = 'shiguang_share_identity';
const EXT_MAP = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function getIdentity(){ try{ return wx.getStorageSync(ID_KEY) || {}; }catch(e){ return {}; } }

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    type: '餐厅',
    types: ['餐厅', '景点', '其他'],
    name: '',
    desc: '',
    photos: [],
    uploading: false
  },

  onLoad(){
    const id = getIdentity();
    this.setData({ nickname: id.nickname || '', avatarUrl: id.avatarUrl || '' });
  },

  onNickname(e){ this.setData({ nickname: e.detail.value || '' }); },

  onChooseAvatar(e){
    // 头像昵称填写能力：返回临时路径，发布时统一上传云存储持久化
    this.setData({ avatarUrl: e.detail.avatarUrl || '' });
  },

  setType(e){ this.setData({ type: e.currentTarget.dataset.t }); },

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
        const tasks = res.tempFiles.map(f => new Promise(resolve => {
          wx.compressImage({ src: f.tempFilePath, quality: 60, compressedWidth: 1280 })
            .then(r => resolve(r.tempFilePath))
            .catch(() => resolve(f.tempFilePath));   // 老机型不支持参数时用原图
        }));
        Promise.all(tasks).then(paths => {
          this.setData({ photos: this.data.photos.concat(paths).slice(0, 3) });
        });
      }
    });
  },

  removePhoto(e){
    const i = e.currentTarget.dataset.i;
    const photos = this.data.photos.slice();
    photos.splice(i, 1);
    this.setData({ photos });
  },

  previewPhoto(e){
    wx.previewImage({ urls: this.data.photos, current: this.data.photos[e.currentTarget.dataset.i] });
  },

  _upload(localPath, dir){
    const m = /\.([a-z0-9]+)$/i.exec(localPath);
    const ext = (m && EXT_MAP[m[1].toLowerCase()]) ? m[1].toLowerCase() : 'jpg';
    return wx.cloud.uploadFile({
      cloudPath: dir + '/' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '.' + ext,
      filePath: localPath
    }).then(r => r.fileID);
  },

  doPublish(){
    if(this.data.uploading) return;
    const name = this.data.name.trim();
    const desc = this.data.desc.trim();
    const nickname = (this.data.nickname || '').trim() || '路过的朋友';
    if(!name){ wx.showToast({ title: '给推荐起个名字', icon: 'none' }); return; }
    if(!this.data.photos.length){ wx.showToast({ title: '至少放一张照片', icon: 'none' }); return; }
    if(!wx.cloud || !wx.cloud.uploadFile){ wx.showToast({ title: '云开发未开通', icon: 'none' }); return; }

    this.setData({ uploading: true });
    wx.showLoading({ title: '发布中…', mask: true });

    const jobs = [];
    if(this.data.avatarUrl && !/^cloud:\/\//.test(this.data.avatarUrl)){
      jobs.push(this._upload(this.data.avatarUrl, 'avatars').then(id => { this.data.avatarUrl = id; }).catch(() => {}));
    }
    this.data.photos.forEach(p => jobs.push(this._upload(p, 'posts')));
    Promise.all(jobs)
      .then(ids => {
        const photos = ids.filter(x => /^cloud:\/\//.test(x));
        if(!photos.length){ throw new Error('照片上传失败，请重试'); }
        try{ wx.setStorageSync(ID_KEY, { nickname, avatarUrl: this.data.avatarUrl }); }catch(e){}
        return wx.cloud.callFunction({
          name: 'postApi',
          data: { action: 'publish', post: { nickname, avatarUrl: this.data.avatarUrl, type: this.data.type, name, desc, photos } }
        }).then(r => r.result);
      })
      .then(r => {
        wx.hideLoading();
        if(r && r.ok){
          wx.showToast({ title: '发布成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 700);
        }else{
          wx.showToast({ title: (r && r.error) || '发布失败', icon: 'none', duration: 2500 });
          this.setData({ uploading: false });
        }
      })
      .catch(e => {
        wx.hideLoading();
        wx.showToast({ title: e.message || '发布失败', icon: 'none', duration: 2500 });
        this.setData({ uploading: false });
      });
  }
});
