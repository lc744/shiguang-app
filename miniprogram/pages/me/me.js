// 绸缪 v2 · 我的 —— 账户中心：微信登录、头像昵称（填写能力）、个人信息云同步、我的发布/设置入口
const ID_KEY = 'shiguang_share_identity';

function readLocal(){ try{ return wx.getStorageSync(ID_KEY) || null; }catch(e){ return null; } }

Page({
  data: {
    loading: true,
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    editing: false,
    draftNickname: '',
    draftAvatar: '',
    saving: false
  },

  onShow(){ this.refresh(); },

  refresh(){
    const local = readLocal();
    if(!local || !local.nickname){
      this.setData({ loading: false, loggedIn: false, editing: false });
      return;
    }
    this.setData({ loading: false, loggedIn: true, nickname: local.nickname, avatarUrl: local.avatarUrl || '', editing: false });
    // 云端静默刷新（多设备一致性）
    if(wx.cloud && wx.cloud.callFunction){
      wx.cloud.callFunction({ name: 'postApi', data: { action: 'profile', mode: 'get' } })
        .then(r => {
          const p = r.result && r.result.profile;
          if(p && p.nickname && (!local.updatedAt || (p.updatedAt || 0) > (local.updatedAt || 0))){
            wx.setStorageSync(ID_KEY, { nickname: p.nickname, avatarUrl: p.avatarUrl || '', updatedAt: p.updatedAt });
            this.setData({ nickname: p.nickname, avatarUrl: p.avatarUrl || '' });
          }
        }).catch(() => {});
    }
  },

  // 微信一键登录（个人主体：openid 静默 + 头像昵称填写能力）
  doLogin(){
    const go = () => {
      this.setData({
        loggedIn: true,
        editing: true,
        draftNickname: this.data.nickname || '',
        draftAvatar: this.data.avatarUrl || ''
      });
    };
    if(wx.login){
      wx.login({ complete: go });   // openid 由云函数上下文获得，code 无需上送
    }else{
      go();
    }
  },

  onChooseAvatar(e){
    this.setData({ draftAvatar: e.detail.avatarUrl || '' });
  },

  onDraftNickname(e){ this.setData({ draftNickname: e.detail.value || '' }); },

  cancelEdit(){
    if(!readLocal()){ this.setData({ editing: false, loggedIn: false }); return; }
    this.setData({ editing: false });
  },

  saveProfile(){
    if(this.data.saving) return;
    const nickname = (this.data.draftNickname || '').trim();
    const avatar = this.data.draftAvatar;
    if(!nickname){ wx.showToast({ title: '给自己起个昵称', icon: 'none' }); return; }
    this.setData({ saving: true });
    const finish = (avatarUrl) => {
      const now = Date.now();
      const profile = { nickname, avatarUrl, updatedAt: now };
      try{ wx.setStorageSync(ID_KEY, profile); }catch(e){}
      this.setData({ saving: false, editing: false, loggedIn: true, nickname, avatarUrl });
      wx.showToast({ title: '已保存', icon: 'success' });
      if(wx.cloud && wx.cloud.callFunction){
        wx.cloud.callFunction({ name: 'postApi', data: { action: 'profile', mode: 'save', profile } }).catch(() => {});
      }
    };
    if(avatar && !/^cloud:\/\//.test(avatar) && wx.cloud && wx.cloud.uploadFile){
      const m = /\.([a-z0-9]+)$/i.exec(avatar);
      const ext = (m ? m[1] : 'jpg').toLowerCase();
      wx.cloud.uploadFile({
        cloudPath: 'avatars/' + now() + '.' + (ext === 'jpeg' ? 'jpg' : ext),
        filePath: avatar
      }).then(r => finish(r.fileID)).catch(() => finish(avatar));   // 上传失败也保存本地路径
    }else{
      finish(avatar);
    }
  },

  goMyPosts(){
    const app = getApp();
    if(app){ app.globalData = app.globalData || {}; app.globalData.shareTab = 'mine'; }
    wx.switchTab({ url: '/pages/share/share' });
  },

  goSettings(){ wx.navigateTo({ url: '/pages/settings/settings' }); },

  logout(){
    wx.showModal({
      title: '退出登录？',
      content: '本地个人信息将被清除，提醒与备份不受影响',
      confirmText: '退出',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        try{ wx.removeStorageSync(ID_KEY); }catch(e){}
        this.setData({ loggedIn: false, editing: false, nickname: '', avatarUrl: '' });
        wx.showToast({ title: '已退出', icon: 'none' });
      }
    });
  }
});

function now(){ return Date.now(); }
