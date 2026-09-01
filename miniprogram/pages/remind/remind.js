// 绸缪 · 到点全屏提醒页 —— 移植自 Web 版 app/reminder.js（fireRemind/snoozeRemind/completeRemind）+ index.html remindOverlay
const store = require('../../utils/store');
const notify = require('../../utils/notify');
const core = require('../../utils/core');
const tts = require('../../utils/tts');

// 弹窗自动超时配置（60 秒自动关闭，与 Web 版 REMIND_AUTO_DISMISS 一致）
const REMIND_AUTO_DISMISS = 60 * 1000;

Page({
  data: {
    themeClass: '',
    bg: 'rgba(238,244,241,.97)',
    statusBarHeight: 0,
    emojiText: '⏰',
    emojiImg: '',   // 自定义表情图片路径（非空时用 image 展示）
    name: '',
    note: '',
    time: ''
  },

  onLoad(options){
    // navigationStyle: custom → 自行处理顶部安全区
    try{
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.setData({ statusBarHeight: info.statusBarHeight || 0 });
    }catch(e){}

    const e = options && options.id ? store.findEvent(options.id) : null;
    if(!e){
      wx.showToast({ title: '提醒不存在或已删除', icon: 'none' });
      setTimeout(() => this.finish(), 800);
      return;
    }
    this._event = e;

    // 展示内容（与 Web 版 fireRemind 一致）
    const custom = store.isCustomEmoji(e.emoji);
    this.setData({
      emojiImg: custom ? store.emojiSrc(e.emoji) : '',
      emojiText: custom ? '' : (e.isBirthday ? '🎂' : store.emojiIcon(e.emoji || '⏰')),
      name: e.isBirthday ? '🎂 ' + e.name + ' 生日快乐！' : e.name,
      note: e.isBirthday ? (e.note || '又长大一岁啦，愿新的一岁平安喜乐！') : (e.note || ''),
      time: e.time
    });

    // 语音播报（自定义录音优先，其次 TTS；不可用/失败时静默）
    this.playVoice(e);

    // 60 秒自动关闭
    this._dismissTimer = setTimeout(() => {
      this._dismissTimer = null;
      this.finish();
    }, REMIND_AUTO_DISMISS);
  },

  onShow(){
    // 主题同其他页：跟随全局解析结果
    const app = getApp();
    const dark = !!(app && app.globalData && app.globalData.resolvedTheme === 'dark');
    this.setData({
      themeClass: dark ? 'theme-dark' : '',
      bg: dark ? 'rgba(15,23,20,.97)' : 'rgba(238,244,241,.97)'
    });
  },

  onHide(){ tts.stop(); },

  onUnload(){
    if(this._dismissTimer){ clearTimeout(this._dismissTimer); this._dismissTimer = null; }
    tts.stop();
  },

  /* ---------------- 语音播报 ---------------- */
  playVoice(e){
    // 自定义录音优先
    const path = store.resolveVoicePath(e);
    if(path){ tts.playFile(path).catch(() => {}); return; }
    // 生日事件播报生日祝福；否则播报“音色短语 + 备注/名称”（与 Web 版 speakReminder 一致）
    let text;
    if(e.isBirthday){
      text = '今天是你' + e.name + '的生日，祝你生日快乐，天天开心！';
    } else {
      const phrase = e.voice && core.VOICE_PHRASES[e.voice] ? core.VOICE_PHRASES[e.voice][0] : '提醒你';
      text = [phrase, e.note || e.name].filter(Boolean).join('，');
    }
    // TTS 不可用或合成/播放失败时静默（页面文案已足够）
    tts.speak(text).catch(() => {});
  },

  /* ---------------- 按钮动作 ---------------- */
  // 贪睡：延后 N 分钟再提醒
  onSnooze(ev){
    const minutes = parseInt(ev.currentTarget.dataset.min, 10) || 10;
    const e = this._event;
    if(!e){ this.finish(); return; }
    const stamp = notify.snoozeEvent(e, minutes);
    wx.showToast({ title: '已延后到 ' + String(stamp).slice(11) + ' 再提醒', icon: 'none' });
    this.finish();
  },

  // 在提醒弹层直接标记今天完成
  onComplete(){
    const e = this._event;
    if(e) notify.completeToday(e);
    wx.showToast({ title: '「' + (e ? e.name : '') + '」已完成', icon: 'none' });
    this.finish();
  },

  // 知道啦：直接关闭
  onDismiss(){ this.finish(); },

  /* ---------------- 关闭（清定时器 → 停语音 → 返回） ---------------- */
  finish(){
    if(this._dismissTimer){ clearTimeout(this._dismissTimer); this._dismissTimer = null; }
    tts.stop();
    wx.navigateBack({
      fail: () => {
        // 提醒页是栈中唯一页面时（分享/直达进入），退回首页兜底
        try{ wx.switchTab({ url: '/pages/home/home' }); }catch(err){}
      }
    });
  }
});
