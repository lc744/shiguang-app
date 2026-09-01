// 绸缪小程序 · 全局入口（数据加载、主题、到点提醒轮询）
const store = require('./utils/store');
const notify = require('./utils/notify');
const core = require('./utils/core');

const THEME_KEY = 'shiguang_theme';
const BG_COLOR_KEY = 'shiguang_bg_color';

App({
  globalData: {
    theme: 'system',        // system | light | dark
    resolvedTheme: 'light', // 实际解析后的主题（页面用它挂 theme-dark 类）
    bgColor: '#eef4f1',
    defaultColors: ['#eef4f1', '#fef3c7', '#fce7f3', '#e0e7ff', '#fecaca', '#ccfbf1', '#f5d0fe']
  },

  onLaunch(){
    // 云开发（语音播报/语音识别）：未开通环境时静默跳过，调用方自带降级
    try{ if(wx.cloud) wx.cloud.init({ traceUser: true }); }catch(e){}
    store.loadAll();
    // 主题
    try{
      let t = wx.getStorageSync(THEME_KEY) || 'system';
      if(t !== 'light' && t !== 'dark') t = 'system';
      this.globalData.theme = t;
    }catch(e){}
    this.applyTheme();
    // 背景色
    try{
      const bg = wx.getStorageSync(BG_COLOR_KEY);
      this.globalData.bgColor = bg || this.globalData.defaultColors[0];
    }catch(e){}
    // 前台轮询到点提醒（小程序切后台时定时器自动挂起，回前台由 onShow 补查）
    this._timer = setInterval(() => this.checkReminders(), 5000);
  },

  onShow(){ this.checkReminders(); },
  onHide(){},

  // 主题解析：system 跟随微信深浅色
  applyTheme(){
    let resolved = this.globalData.theme;
    if(resolved === 'system'){
      try{
        const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
        resolved = info.theme === 'dark' ? 'dark' : 'light';
      }catch(e){ resolved = 'light'; }
    }
    this.globalData.resolvedTheme = resolved;
  },

  setTheme(theme){
    this.globalData.theme = theme;
    try{ wx.setStorageSync(THEME_KEY, theme); }catch(e){}
    this.applyTheme();
    try{ wx.setStorageSync(BG_COLOR_KEY, this.globalData.bgColor); }catch(e){}
  },

  setBgColor(color){
    this.globalData.bgColor = color;
    try{ wx.setStorageSync(BG_COLOR_KEY, color); }catch(e){}
  },

  // 到点检查：有到期事件且当前不在提醒页 → 跳转全屏提醒
  checkReminders(){
    const due = notify.findDue();
    if(!due) return;
    const pages = getCurrentPages();
    const cur = pages[pages.length - 1];
    if(cur && cur.route === 'pages/remind/remind') return;
    notify.markFired(due);
    // 必须用绝对路径（开头带 /）：相对路径会被解析成 当前页面目录/pages/remind/... 导致页面不存在
    wx.navigateTo({ url: '/pages/remind/remind?id=' + due.id, fail: e => { console.log('提醒页跳转失败：', e && e.errMsg); } });
  }
});
