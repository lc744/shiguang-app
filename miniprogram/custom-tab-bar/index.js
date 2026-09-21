// 绸缪小程序 · 自定义 tabBar（对齐 App：emoji 图标 + 选中胶囊高亮 + 顶部指示条，中间为精灵）
Component({
  data: {
    selected: 0,
    dark: false,        // 主题跟随宿主页（页面 onShow 里同步 dark）
    list: [
      { pagePath: '/pages/home/home', icon: '⌂', label: '今天' },
      { pagePath: '/pages/upcoming/upcoming', icon: '⏳', label: '预告' },
      { pagePath: '', icon: '', label: '' },   // 占位：中间精灵按钮（点击弹面板，不切页）
      { pagePath: '/pages/share/share', icon: '✦', label: '分享' },
      { pagePath: '/pages/me/me', icon: '👤', label: '我的' }
    ]
  },
  methods: {
    switchTab(e){
      const { path, index } = e.currentTarget.dataset;
      // 中间精灵（对齐 App）：不切页，在当前页弹出聊天小面板
      if(Number(index) === 2){
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if(page && page.openGeniePanel) page.openGeniePanel();
        else wx.showToast({ title: '稍等一下再试', icon: 'none' });
        return;
      }
      if(index === this.data.selected) return;
      wx.switchTab({ url: path });
    }
  }
});
