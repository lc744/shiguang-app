// 绸缪小程序 · 预告页（未来事件列表）
const core = require('../../utils/core');
const store = require('../../utils/store');
const format = require('../../utils/format');

Page({
  data: {
    themeClass: '',
    bgColor: '#eef4f1',
    list: [],
    empty: false
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
  },

  onEventTap(e){ wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },

  onAddTap(){ wx.navigateTo({ url: '/pages/editor/editor' }); }
});
