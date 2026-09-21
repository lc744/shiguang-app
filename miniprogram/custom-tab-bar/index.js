// 绸缪小程序 · 自定义 tabBar（对齐 App：emoji 图标 + 选中胶囊高亮 + 顶部指示条，中间为精灵）
Component({
  data: {
    selected: 0,
    dark: false,        // 主题跟随宿主页（页面 onShow 里同步 dark）
    list: [
      { pagePath: '/pages/home/home', icon: '⌂', label: '今天' },
      { pagePath: '/pages/upcoming/upcoming', icon: '⏳', label: '预告' },
      { pagePath: '/pages/genie/genie', icon: '🧚', label: '精灵' },
      { pagePath: '/pages/share/share', icon: '✦', label: '分享' },
      { pagePath: '/pages/me/me', icon: '👤', label: '我的' }
    ]
  },
  methods: {
    switchTab(e){
      const { path, index } = e.currentTarget.dataset;
      if(index === this.data.selected && path !== '/pages/genie/genie') return;
      wx.switchTab({ url: path });
    }
  }
});
