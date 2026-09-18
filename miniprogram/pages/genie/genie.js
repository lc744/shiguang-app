// 绸缪小程序 · 精灵页（tab 中间按钮，对齐 App 的 genie-tab）——直接展开聊天面板
Page({
  data: {},
  onLoad(){},
  onShow(){
    if(typeof this.getTabBar === 'function' && this.getTabBar()){
      this.getTabBar().setData({ selected: 2 });
    }
  }
});
