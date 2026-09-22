// 绸缪小程序 · 预告页（未来事件列表）
const core = require('../../utils/core');
const store = require('../../utils/store');
const format = require('../../utils/format');
const hero = require('../../utils/hero');

Page({
  data: {
    themeClass: '',
    bgColor: '#eef4f1',
    list: [],
    empty: false,
    multiOn: false,
    multiIds: [],
    // 公共区（对齐安卓：hero + 统计卡为首页/预告公共区）
    slides: [],
    slideIndex: 0,
    statTodo: 0,
    statDone: 0
  },

  onLoad(){
    // hero 幻灯片数据：与首页同一套寄语（安卓 hero 为首页/预告公共区）
    const slides = hero.HERO_QUOTES.map((q, i) => ({
      idx: i,
      heroCat: q.title,
      heroMainTitle: q.subtitle,
      heroDesc: q.text,
      deco: hero.HERO_DECORATIONS[Math.floor(Math.random() * hero.HERO_DECORATIONS.length)]
    }));
    this.setData({ slides });
  },


  // tabBar 精灵入口：弹出聊天小面板（对齐 App genie-panel）
  openGeniePanel(){
    const c = this.selectComponent('#geniecomp');
    if(c && c.openPanel) c.openPanel();
  },
  _isDarkTheme(){
    const app = getApp();
    return !!(app && app.globalData && app.globalData.resolvedTheme === 'dark');
  },

  // 滚动联动 tabBar：向下浏览自动隐藏、回到顶部恢复（内容不被 tab 遮挡）
  onPageScroll(e){
    const tb = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if(!tb || !tb.setHidden) return;
    const hide = e.scrollTop > 80;
    if(tb.data.hidden !== hide) tb.setHidden(hide);
  },
  onShow(){
    if(typeof this.getTabBar === 'function' && this.getTabBar()){
      const tb = this.getTabBar();
    if(tb){ tb.setData({ selected: 1, dark: this._isDarkTheme() }); }
    }
    const app = getApp();
    this.setData({
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor
    });
    this.refresh();
  },

  refresh(){
    const t = core.todayStr();
    const now = new Date();
    const nowHHMM = core.pad(now.getHours()) + ':' + core.pad(now.getMinutes());
    const nowStamp = t + 'T' + nowHHMM;

    // 计算每个事件的下一次发生；有贪睡覆盖时优先用贪睡时间
    const items = store.getEvents().map(e => {
      let ds;
      if(e.snooze && e.snooze > nowStamp){
        ds = e.snooze.slice(0, 10);
      } else {
        ds = core.nextOccur(e, t);
        if(!ds) return null;
        // 今天已发生且时间已过（非重复）
        if(ds === t && e.time <= nowHHMM && !e.weekdays.length) return null;
        // 今天已完成
        if(ds === t && core.isDoneOn(e, t)) return null;
      }
      return { e: e, ds: ds };
    }).filter(Boolean)
      .sort((a, b) => (a.ds + a.e.time).localeCompare(b.ds + b.e.time));

    const list = items.map(it => {
      const e = it.e;
      const d = format.daysUntil(it.ds);
      const label = d === 0 ? '今天' : d === 1 ? '明天' : d === 2 ? '后天' : d + ' 天后';
      const repeat = core.repeatLabel(e);
      return {
        id: e.id,
        time: e.time,
        label: label,
        name: e.name,
        note: e.note || '无备注',
        emojiImg: store.isCustomEmoji(e.emoji) ? store.emojiSrc(e.emoji) : '',
        emojiText: store.emojiIcon(e.emoji),
        voiceTag: '♫ ' + (e.voice || ''),
        dateTag: format.dateLabel(it.ds),
        repeatTag: repeat ? '↻ ' + repeat : ''
      };
    });

    this.setData({ list: list, empty: list.length === 0 });
    this._refreshStats(t);
  },

  // 品牌头右侧按钮：跳回今天（对齐安卓 header 全局导航）
  goHome(){ wx.switchTab({ url: '/pages/home/home' }); },

  // hero 手动切换（与首页一致）
  prevSlide(){
    const n = this.data.slides.length;
    this.setData({ slideIndex: ((this.data.slideIndex || 0) - 1 + n) % n });
  },
  nextSlide(){
    const n = this.data.slides.length;
    this.setData({ slideIndex: ((this.data.slideIndex || 0) + 1) % n });
  },
  onSlideChange(e){ this.setData({ slideIndex: e.detail.current }); },

  // 统计卡：今天的待办/完成（对齐安卓公共区 stats）
  _refreshStats(t){
    const todays = store.getEvents().filter(e => core.occursOn(e, t));
    const done = todays.filter(e => core.isDoneOn(e, t)).length;
    this.setData({ statTodo: todays.length - done, statDone: done });
  },

  // 清空事件（与首页同款确认逻辑）
  onClearAll(){
    wx.showModal({
      title: '清空全部事件',
      content: '将删除所有提醒（含录音文件），此操作不可恢复',
      confirmText: '清空',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        store.getEvents().forEach(e => store.deleteRecording(e.voiceData));
        store.setEvents([]);
        this.refresh();
        wx.showToast({ title: '已清空全部事件', icon: 'none' });
      }
    });
  },

  // 长按事件卡：进入多选模式（对齐安卓，长按的那条默认选中）
  onEventLongPress(e){
    const id = e.currentTarget.dataset.id;
    this.setData({ multiOn: true, multiIds: [id] });
    wx.showToast({ title: '已进入多选模式，点选要删除的事件', icon: 'none', duration: 2000 });
  },

  onEventTap(e){
    const id = e.currentTarget.dataset.id;
    // 多选模式下点击 = 勾选/取消
    if(this.data.multiOn){
      const ids = this.data.multiIds.slice();
      const i = ids.indexOf(id);
      if(i >= 0) ids.splice(i, 1); else ids.push(id);
      this.setData({ multiIds: ids });
      return;
    }
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  // 全选：当前预告列表的全部事件
  multiAll(){
    const ids = this.data.list.map(x => x.id);
    this.setData({ multiIds: ids });
  },

  // 批量删除（确认 → 清理录音 → 过滤 → 退出多选）
  multiDelete(){
    const ids = this.data.multiIds;
    if(!ids.length){ wx.showToast({ title: '先勾选要删除的事件', icon: 'none' }); return; }
    wx.showModal({
      title: '批量删除',
      content: '确定删除选中的 ' + ids.length + ' 个事件吗？删除后不可恢复',
      confirmText: '删除',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        const delSet = ids.slice();
        const events = store.getEvents();
        events.forEach(e => { if(delSet.indexOf(e.id) >= 0) store.deleteRecording(e.voiceData); });
        store.setEvents(events.filter(e => delSet.indexOf(e.id) < 0));
        this.setData({ multiOn: false, multiIds: [] });
        this.refresh();
        wx.showToast({ title: '已删除 ' + delSet.length + ' 个事件', icon: 'none' });
      }
    });
  },

  multiExit(){ this.setData({ multiOn: false, multiIds: [] }); },

  onAddTap(){ wx.navigateTo({ url: '/pages/editor/editor' }); }
});
