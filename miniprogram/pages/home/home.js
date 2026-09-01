// 绸缪小程序 · 首页（品牌头 / hero 幻灯片 / 统计卡 / 错过提醒横幅 / 今天列表 / 悬浮添加按钮）
const core = require('../../utils/core');
const store = require('../../utils/store');
const notify = require('../../utils/notify');
const hero = require('../../utils/hero');
const format = require('../../utils/format');

// 当日错过提醒忽略记录的存储键
function missedHiddenKey(){ return 'shiguang_missed_hidden_' + core.todayStr(); }

Page({
  data: {
    themeClass: '',
    bgColor: '#eef4f1',
    homeDate: '',
    statTodo: 0,
    statDone: 0,
    slides: [],
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

  onShow(){
    const app = getApp();
    this.setData({
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor
    });
    this.refresh();
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
      return {
        id: e.id,
        time: e.time,
        period: format.periodOf(e.time),
        name: e.name,
        note: e.note || '无备注',
        done: core.isDoneOn(e, t),
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

  onSyncTap(){ wx.showToast({ title: '数据已保存在本机', icon: 'none' }); },

  onAddTap(){ wx.navigateTo({ url: '/pages/editor/editor' }); },

  onEventTap(e){ wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },

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
    this.refresh();
    wx.showToast({ title: i >= 0 ? '已恢复为待办' : '已标记完成', icon: 'none' });
  }
});
