// 绸缪小程序 · 隐私授权弹窗组件（微信平台 2023.9 强制规范）
// 挂在涉及隐私接口的页面（录音/相册/头像昵称/导出），触发时机由 wx.onNeedPrivacyAuthorization 决定
Component({
  data: { show: false },

  lifetimes: {
    attached(){
      if(!wx.onNeedPrivacyAuthorization) return;   // 低版本基础库无此 API，静默
      wx.onNeedPrivacyAuthorization(resolve => {
        this._resolve = resolve;
        this.setData({ show: true });
      });
    }
  },

  methods: {
    // 查看完整《用户隐私保护指引》（微信官方半屏页）
    openContract(){
      if(wx.openPrivacyContract) wx.openPrivacyContract({});
    },
    // 同意：open-type="agreePrivacyAuthorization" 的按钮回调里必须调 resolve
    onAgree(){
      this.setData({ show: false });
      if(this._resolve) this._resolve({ event: 'agree', buttonId: 'agree-btn' });
      this._resolve = null;
    },
    // 拒绝：不拦截本次调用，由业务方提示用户
    onDisagree(){
      this.setData({ show: false });
      if(this._resolve) this._resolve({ event: 'disagree' });
      this._resolve = null;
      wx.showToast({ title: '未同意隐私指引，部分功能无法使用', icon: 'none' });
    },
    // 阻止冒泡，点遮罩不关闭
    noop(){}
  }
});
