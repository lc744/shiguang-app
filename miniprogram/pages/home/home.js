// 绸缪小程序 · 首页（品牌头 / hero 幻灯片 / 统计卡 / 错过提醒横幅 / 今天列表 / 悬浮添加按钮）
const core = require('../../utils/core');
const store = require('../../utils/store');
const notify = require('../../utils/notify');
const hero = require('../../utils/hero');
const format = require('../../utils/format');
const subscribe = require('../../utils/subscribe');

// 当日错过提醒忽略记录的存储键
function missedHiddenKey(){ return 'shiguang_missed_hidden_' + core.todayStr(); }

Page({
  data: {
    multiOn: false,
    multiIds: [],
    themeClass: '',
    bgColor: '#eef4f1',
    homeDate: '',
    statTodo: 0,
    statDone: 0,
    slides: [],
    slideIndex: 0,
    missedVisible: false,
    missedCount: 0,
    missedItems: [],
    missedMore: 0,
    list: [],
    empty: false
  },

  onLoad(){
    // hero 幻灯片数据：每屏一条寄语 + 一个随机装饰 emoji
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
    if(tb){ tb.setData({ selected: 0, dark: this._isDarkTheme() }); }
    }
    const app = getApp();
    this.setData({
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor
    });
    this.refresh();
  },

  // 清空全部事件（对齐 App：home 统计行第三卡）
  onClearAll(){
    const events = store.getEvents();
    const n = events.length;
    if(!n){ wx.showToast({ title: '当前没有事件', icon: 'none' }); return; }
    wx.showModal({
      title: '清空全部事件',
      content: '确定清空全部 ' + n + ' 个事件吗？删除后可通过自动备份恢复。',
      confirmText: '清空',
      confirmColor: '#c65c52',
      success: r => {
        if(!r.confirm) return;
        events.forEach(e => store.deleteRecording(e.voiceData));
        store.setEvents([]);
        wx.showToast({ title: '已清空全部事件', icon: 'none' });
        this.refresh();
      }
    });
  },

  refresh(){
    const t = core.todayStr();
    const d = new Date();
    const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    const events = store.getEvents();
    const todays = events.filter(e => core.occursOn(e, t)).sort((a, b) => a.time.localeCompare(b.time));
    const todo = todays.filter(e => !core.isDoneOn(e, t)).length;

    // 错过提醒横幅：过滤今天已手动忽略过的
    let hidden = [];
    try{ hidden = wx.getStorageSync(missedHiddenKey()) || []; }catch(e){ hidden = []; }
    if(!Array.isArray(hidden)) hidden = [];
    const missed = notify.scanMissed().filter(e => hidden.indexOf(e.id) < 0);
    this._missedIds = missed.map(e => e.id);
    const missedItems = missed.slice(0, 5).map(e => ({
      id: e.id,
      name: e.name,
      time: e.time,
      emojiImg: store.isCustomEmoji(e.emoji) ? store.emojiSrc(e.emoji) : '',
      emojiText: store.emojiIcon(e.emoji)
    }));

    const list = todays.map(e => {
      const repeat = core.repeatLabel(e);
      const nowHM = core.pad(new Date().getHours()) + ':' + core.pad(new Date().getMinutes());
      return {
        id: e.id,
        time: e.time,
        period: format.periodOf(e.time),
        name: e.name,
        note: e.note || '无备注',
        done: core.isDoneOn(e, t),
        overdue: !core.isDoneOn(e, t) && e.time <= nowHM,
        emojiImg: store.isCustomEmoji(e.emoji) ? store.emojiSrc(e.emoji) : '',
        emojiText: store.emojiIcon(e.emoji),
        voiceTag: (e.voice === '自定义录音' && e.voiceData) ? '● 已录音' : '♫ ' + (e.voice || ''),
        repeatTag: repeat ? '↻ ' + repeat : ''
      };
    });

    this.setData({
      homeDate: (d.getMonth() + 1) + '月' + d.getDate() + '日 · 星期' + wd,
      statTodo: todo,
      statDone: todays.length - todo,
      missedVisible: missed.length > 0,
      missedCount: missed.length,
      missedItems: missedItems,
      missedMore: missed.length > 5 ? missed.length - 5 : 0,
      list: list,
      empty: todays.length === 0
    });
  },

  goCalendar(){ wx.navigateTo({ url: '/pages/calendar/calendar' }); },

  // hero 幻灯片手动切换（对齐 App prevSlide/nextSlide）
  prevSlide(){
    const n = this.data.slides.length;
    this.setData({ slideIndex: ((this.data.slideIndex || 0) - 1 + n) % n });
  },
  nextSlide(){
    const n = this.data.slides.length;
    this.setData({ slideIndex: ((this.data.slideIndex || 0) + 1) % n });
  },
  onSlideChange(e){ this.setData({ slideIndex: e.detail.current }); },

  onAddTap(){ wx.navigateTo({ url: '/pages/editor/editor' }); },

  // 长按事件卡：进入多选模式（对齐安卓 480ms 长按 enterMultiSel，长按的那条默认选中）
  onEventLongPress(e){
    const id = e.currentTarget.dataset.id;
    this.setData({ multiOn: true, multiIds: [id] });
    wx.showToast({ title: '已进入多选模式，点选要删除的事件', icon: 'none', duration: 2000 });
  },

  onEventTap(e){
    const id = e.currentTarget.dataset.id;
    // 多选模式下点击 = 勾选/取消（对齐安卓 toggleMultiSel）
    if(this.data.multiOn){
      const ids = this.data.multiIds.slice();
      const i = ids.indexOf(id);
      if(i >= 0) ids.splice(i, 1); else ids.push(id);
      this.setData({ multiIds: ids });
      return;
    }
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  // 全选：今天发生的全部事件（对齐安卓 multiSelAll home 分支）
  multiAll(){
    const t = core.todayStr();
    const events = store.getEvents();
    const ids = [];
    events.forEach(e => { try{ if(core.occursOn(e, t)) ids.push(e.id); }catch(err){} });
    this.setData({ multiIds: ids });
  },

  // 批量删除（对齐安卓 multiSelDelete：确认 → 清理录音 → 过滤 → 退出多选）
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

  onMissedTap(e){ wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },

  // 点“知道了”：把当前全部错过事件写入当日忽略记录并刷新
  onHideMissed(){
    try{ wx.setStorageSync(missedHiddenKey(), this._missedIds || []); }catch(e){}
    this.refresh();
  },

  // 点完成圆点/复选：切换今天完成状态后刷新 + 重算统计
  onToggleDone(e){
    const id = e.currentTarget.dataset.id;
    const ev = store.findEvent(id);
    if(!ev) return;
    const t = core.todayStr();
    const doneOn = (ev.doneOn || []).slice();
    const i = doneOn.indexOf(t);
    if(i >= 0) doneOn.splice(i, 1); else doneOn.push(t);
    store.updateEvent(id, { doneOn: doneOn });
    subscribe.ensureSync(store.findEvent(id));   // 完成状态同步云端，到期不再推送
    this.refresh();
    wx.showToast({ title: i >= 0 ? '已恢复为待办' : '已标记完成', icon: 'none' });
  }
});
