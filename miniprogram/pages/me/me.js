// 绸缪 v2 · 我的 —— 账户中心：微信登录、头像昵称（填写能力）、个人信息云同步、统计、我的发布/设置入口
const ID_KEY = 'shiguang_share_identity';
const store = require('../../utils/store');
const core = require('../../utils/core');

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
    saving: false,
    statEvents: 0,
    statDone: 0,
    statPosts: '—',
    gender: '',
    birth: '',
    adminMode: false
  },

  onShow(){
    if(typeof this.getTabBar === 'function' && this.getTabBar()){
      this.getTabBar().setData({ selected: 4 });
    }
    this.refresh();
  },

  refresh(){
    // 本地统计（提醒/完成次数）
    try{
      const events = store.getEvents();
      const doneCount = events.reduce((s, e) => s + ((e.doneOn || []).length || (e.done ? 1 : 0)), 0);
      this.setData({ statEvents: events.length, statDone: doneCount });
    }catch(e){}
    const local = readLocal();
    this.setData({ gender: local.gender || '', birth: local.birth || '' });
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
      // 我的发布数
      wx.cloud.callFunction({ name: 'postApi', data: { action: 'mine', page: 0 } })
        .then(r => {
          const d = r.result || {};
          if(d.ok) this.setData({ statPosts: d.hasMore ? (d.list || []).length + '+' : (d.list || []).length });
        }).catch(() => {});
      // 管理员判定（users 集合 admin:true 的用户显示管理入口）
      wx.cloud.callFunction({ name: 'postApi', data: { action: 'adminCheck' } })
        .then(r => {
          const a = r.result || {};
          if(a.ok && a.admin) this.setData({ adminMode: true });
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

  goCalendar(){ wx.navigateTo({ url: '/pages/calendar/calendar' }); },

  goMyComments(){ wx.navigateTo({ url: '/pages/mycomments/mycomments' }); },

  goPlans(){ wx.navigateTo({ url: '/pages/plans/plans' }); },

  goAdmin(){ wx.navigateTo({ url: '/pages/admin/admin' }); },

  // 隐藏开启口：长按"设置"→ 输入管理口令 → 云端标记 admin:true（对齐 App 管理员逻辑）
  onSecretAdmin(){
    if(this.data.adminMode){
      wx.showToast({ title: '你已是管理员', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '管理员口令',
      editable: true,
      placeholderText: '输入管理员口令',
      success: res => {
        if(!res.confirm) return;
        const pass = String(res.content || '').trim();
        if(!pass) return;
        wx.showLoading({ title: '验证中…', mask: true });
        wx.cloud.callFunction({ name: 'postApi', data: { action: 'adminGrant', pass } })
          .then(r => {
            wx.hideLoading();
            const d = r.result || {};
            if(d.ok && d.admin){
              this.setData({ adminMode: true });
              wx.showToast({ title: '管理员已开启', icon: 'success' });
            } else {
              wx.showToast({ title: d.error || '口令不对', icon: 'none' });
            }
          })
          .catch(e => { wx.hideLoading(); wx.showToast({ title: (e.errMsg || '验证失败'), icon: 'none' }); });
      }
    });
  },

  /* 性别 / 出生年月（对齐 App 资料行，本地保存） */
  onPickGender(){
    wx.showActionSheet({
      itemList: ['男', '女', '保密'],
      success: res => {
        const g = ['男', '女', '保密'][res.tapIndex] || '';
        const id = readLocal() || {};
        try{ wx.setStorageSync(ID_KEY, { ...id, gender: g }); }catch(e){}
        this.setData({ gender: g });
      }
    });
  },
  onPickBirth(){
    const now = new Date();
    const cur = this.data.birth || (now.getFullYear() - 10) + '-01';
    wx.showModal({
      title: '出生年月',
      editable: true,
      placeholderText: '格式：2000-06',
      content: cur.length >= 7 ? cur : '',
      success: res => {
        if(!res.confirm) return;
        const v = String(res.content || '').trim();
        if(v && !/^\d{4}-\d{2}$/.test(v)){ wx.showToast({ title: '格式应为 2000-06', icon: 'none' }); return; }
        const id = readLocal() || {};
        try{ wx.setStorageSync(ID_KEY, { ...id, birth: v }); }catch(e){}
        this.setData({ birth: v });
      }
    });
  },

  // 绑定码登录 App：输入 app 端「微信登录」显示的 6 位码，云函数用 openid 确认
  onWxBind(){
    const id = readLocal() || {};
    wx.showModal({
      title: '绑定码登录 App',
      editable: true,
      placeholderText: '输入 App 上显示的 6 位登录码',
      confirmText: '确认绑定',
      success: (res) => {
        if(!res.confirm) return;
        const loginId = String(res.content || '').replace(/\D/g, '').slice(0, 6);
        if(loginId.length !== 6){ wx.showToast({ title: '请输入 6 位数字码', icon: 'none' }); return; }
        wx.showLoading({ title: '绑定中…' });
        wx.cloud.callFunction({
          name: 'profileApi',
          data: { action: 'wxBindToApp', loginId, nickname: id.nickname || '', avatar: id.avatarUrl || '' },
        }).then(r => {
          wx.hideLoading();
          const b = r.result || {};
          if(b.statusCode === 200){ wx.showToast({ title: '绑定成功，回 App 查看结果', icon: 'none', duration: 2500 }); }
          else{ wx.showToast({ title: (b.body && JSON.parse(b.body).error) || '绑定失败', icon: 'none', duration: 2500 }); }
        }).catch(() => { wx.hideLoading(); wx.showToast({ title: '网络异常，请重试', icon: 'none' }); });
      },
    });
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
