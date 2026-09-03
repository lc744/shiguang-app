// 绸缪小程序 · 事件详情页（状态、时间、表情、音色、备注 + 删除/延后/完成/编辑）
const core = require('../../utils/core');
const store = require('../../utils/store');
const notify = require('../../utils/notify');
const format = require('../../utils/format');
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    themeClass: '',
    bgColor: '#eef4f1',
    name: '—',
    status: '—',
    timeline: '—',
    emojiImg: '',
    emojiText: '⏰',
    voice: '—',
    note: '无备注'
  },

  onLoad(options){
    this._id = (options && options.id) || '';
  },

  onShow(){
    const app = getApp();
    this.setData({
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor
    });
    // 从编辑页返回后自动刷新
    this.refresh();
  },

  goBack(){
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) });
  },

  refresh(){
    const e = store.findEvent(this._id);
    if(!e){
      wx.showToast({ title: '事件不存在或已删除', icon: 'none' });
      this.goBack();
      return;
    }
    const t = core.todayStr();
    const due = new Date(e.date + 'T' + e.time + ':00');
    let status;
    if(core.isDoneOn(e, t)) status = '已完成';
    else if(due < new Date()) status = '已错过';
    else status = '待办';
    const repeat = core.repeatLabel(e);
    this.setData({
      name: e.name,
      status: status,
      timeline: format.dateLabel(e.date) + ' ' + e.time + ' · ' + format.periodOf(e.time) + (repeat ? ' · 重复：' + repeat : ''),
      emojiImg: store.isCustomEmoji(e.emoji) ? store.emojiSrc(e.emoji) : '',
      emojiText: store.emojiIcon(e.emoji || '⏰'),
      voice: e.voice === '自定义录音' ? (e.voiceData ? '自定义录音 · 已录制' : '自定义录音 · 未录制') : e.voice,
      note: e.note || '无备注'
    });
  },

  onBack(){ this.goBack(); },

  onEdit(){ wx.navigateTo({ url: '/pages/editor/editor?id=' + this._id }); },

  onDelete(){
    const e = store.findEvent(this._id);
    if(!e) return;
    wx.showModal({
      title: '删除提醒',
      content: '确定删除「' + e.name + '」吗？',
      confirmText: '删除',
      confirmColor: '#c65c52',
      success: res => {
        if(!res.confirm) return;
        // 从事件列表移除，并同步清理录音大对象
        store.setEvents(store.getEvents().filter(x => x.id !== this._id));
        store.deleteRecording(e.voiceData);
        subscribe.removeSync(this._id);   // 云端推送记录一并移除
        wx.showToast({ title: '已删除', icon: 'none' });
        this.goBack();
      }
    });
  },

  onSnooze(){
    const e = store.findEvent(this._id);
    if(!e) return;
    const snooze = notify.snoozeEvent(e, 10);
    wx.showToast({ title: '已延后到 ' + snooze.slice(11) + ' 再提醒', icon: 'none' });
    this.goBack();
  },

  onComplete(){
    const e = store.findEvent(this._id);
    if(!e) return;
    notify.completeToday(e);
    subscribe.ensureSync(e);   // 完成状态同步到云端，到期不再推送
    wx.showToast({ title: '已标记完成', icon: 'none' });
    this.goBack();
  }
});
