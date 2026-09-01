// 绸缪小程序 · 新建/编辑提醒表单 —— 移植自 Web 版 editor.js
// （chips 数据驱动、重复规则选择、生日开关、自定义表情导入、自定义录音）
const core = require('../../utils/core');
const store = require('../../utils/store');
const lunar = require('../../utils/lunar');

const REC_MAX_SECONDS = 30;
const REC_TIP_DEFAULT = '录一段自己的声音作为提示音（最长 30 秒）';
const REC_TIP_READY = '录音已就绪，到点提醒时播放你的声音';
const REC_TIP_PRESET = '已使用此事件的原录音';

Page({
  data: {
    themeClass: '',
    bgColor: '#eef4f1',
    isEdit: false,
    editingId: null,
    today: '',
    dateMin: '',
    form: { name: '', note: '', date: '', time: '' },
    // 重复规则 chips（数据驱动）
    repeatChips: [
      { mode: 'none', label: '不重复' },
      { mode: 'daily', label: '每天' },
      { mode: 'weekdays', label: '周一到周五' },
      { mode: 'custom', label: '自定义' }
    ],
    repeatMode: 'none',   // none | daily | weekdays | custom
    weekdays: [],         // 自定义重复时选中的星期（1..7，1=周一）
    weekdayChips: [],
    // 生日
    isBirthday: false,
    lunarBirthday: false,
    // 表情 / 音色
    emojiList: [],
    selectedEmoji: '',
    voiceList: [],
    selectedVoice: '',
    // 录音
    recActive: false,
    recTime: '00:00',
    recTip: REC_TIP_DEFAULT,
    hasRecording: false
  },

  /* ---------------- 生命周期 ---------------- */
  onLoad(options) {
    const editingId = options && options.id ? options.id : null;
    const e = editingId ? store.findEvent(editingId) : null;
    const now = new Date();
    const today = core.todayStr();
    const selectedEmoji = e && e.emoji ? e.emoji : core.EMOJIS[0];
    const selectedVoice = e && e.voice ? e.voice : core.VOICES[0];

    this._recPath = null;     // 当前表单中已就绪的录音文件路径
    this._recOwned = false;   // 该录音是否为本次会话新录制（决定取消时是否回收文件）
    this._saved = false;      // 是否已随保存写入事件
    this._recSilent = false;  // 切走/销毁时的静默停止（不保存）
    this._destroyed = false;
    this._recTimer = null;
    this._recSeconds = 0;
    this._audio = null;

    // 编辑带录音的事件时回填原录音（新建时清空）
    let hasRecording = false;
    if (e && e.voice === '自定义录音') {
      const p = store.resolveVoicePath(e);
      if (p) { this._recPath = p; hasRecording = true; }
    }

    const rep = this.repeatFromEvent(e ? e.weekdays : []);

    this.setData({
      isEdit: !!e,
      editingId: editingId,
      today: today,
      dateMin: today,
      form: {
        name: e ? e.name : '',
        note: e ? (e.note || '') : '',
        date: e ? e.date : today,
        time: e ? e.time : core.pad((now.getHours() + 1) % 24) + ':00'
      },
      repeatMode: rep.mode,
      weekdays: rep.sel,
      weekdayChips: this.buildWdChips(rep.sel),
      isBirthday: !!(e && e.isBirthday),
      lunarBirthday: !!(e && e.lunarBirthday),
      emojiList: this.buildEmojiList(selectedEmoji),
      selectedEmoji: selectedEmoji,
      voiceList: this.buildVoiceList(selectedVoice),
      selectedVoice: selectedVoice,
      hasRecording: hasRecording,
      recTip: hasRecording ? REC_TIP_PRESET : REC_TIP_DEFAULT
    });

    wx.setNavigationBarTitle({ title: e ? '编辑提醒' : '新建提醒' });
    this.initRecorder();
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor
    });
  },

  onHide() { this.teardownRecording(); },

  onUnload() {
    this._destroyed = true;
    this.teardownRecording();
    if (this._audio) { try { this._audio.destroy(); } catch (e) {} this._audio = null; }
    // 本次会话新录、未随保存写入的录音文件回收，避免遗留孤儿文件
    if (this._recOwned && !this._saved && this._recPath) {
      store.deleteRecording(this._recPath);
    }
  },

  /* ---------------- 表单输入 ---------------- */
  onNameInput(e) { this.setData({ 'form.name': e.detail.value }); },
  onNoteInput(e) { this.setData({ 'form.note': e.detail.value }); },
  onDateChange(e) { this.setData({ 'form.date': e.detail.value }); },
  onTimeChange(e) { this.setData({ 'form.time': e.detail.value }); },

  goBack() {
    wx.navigateBack({
      fail: () => { wx.switchTab({ url: '/pages/home/home', fail: () => {} }); }
    });
  },

  /* ---------------- 重复规则 ---------------- */
  // 从事件数据回显重复规则（移植 syncRepeatUI）
  repeatFromEvent(wd) {
    if (!Array.isArray(wd) || !wd.length) return { mode: 'none', sel: [] };
    if (wd.length === 7) return { mode: 'daily', sel: [1, 2, 3, 4, 5, 6, 7] };
    if (wd.length === 5 && [1, 2, 3, 4, 5].every(d => wd.indexOf(d) >= 0)) {
      return { mode: 'weekdays', sel: [1, 2, 3, 4, 5] };
    }
    return { mode: 'custom', sel: wd.slice() };
  },

  buildWdChips(sel) {
    const cur = Array.isArray(sel) ? sel : [];
    return [1, 2, 3, 4, 5, 6, 7].map(d => ({
      d: d,
      label: '周' + core.WD_NAMES[d],
      selected: cur.indexOf(d) >= 0
    }));
  },

  pickRepeat(e) {
    const mode = e.currentTarget.dataset.mode;
    let sel;
    if (mode === 'daily') sel = [1, 2, 3, 4, 5, 6, 7];
    else if (mode === 'weekdays') sel = [1, 2, 3, 4, 5];
    else if (mode === 'none') sel = [];
    else sel = this.data.weekdays.slice(); // 自定义保留已选
    this.setData({ repeatMode: mode, weekdays: sel, weekdayChips: this.buildWdChips(sel) });
  },

  toggleWeekday(e) {
    const d = parseInt(e.currentTarget.dataset.wd, 10);
    const sel = this.data.weekdays.slice();
    const i = sel.indexOf(d);
    if (i >= 0) sel.splice(i, 1); else sel.push(d);
    this.setData({ weekdays: sel, weekdayChips: this.buildWdChips(sel) });
  },

  /* ---------------- 生日开关 ---------------- */
  toggleBirthday() {
    const on = !this.data.isBirthday;
    // 生日可选过去日期（每年触发，occursOn 已处理 ds >= e.date）
    this.setData({ isBirthday: on, dateMin: on ? '1900-01-31' : this.data.today });
  },

  toggleLunarBirthday() {
    this.setData({ lunarBirthday: !this.data.lunarBirthday });
  },

  /* ---------------- 表情 chips ---------------- */
  buildEmojiList(selected) {
    return store.allEmojiValues().map(v => ({
      value: v,
      label: store.emojiIcon(v),
      src: store.isCustomEmoji(v) ? v : '',
      selected: v === selected
    }));
  },

  pickEmoji(e) {
    const v = e.currentTarget.dataset.emoji;
    this.setData({
      selectedEmoji: v,
      emojiList: this.data.emojiList.map(x => ({
        value: x.value, label: x.label, src: x.src, selected: x.value === v
      }))
    });
  },

  // ＋ 导入表情图片：wx.chooseMedia → store.saveEmojiImage 持久化 → 刷新 chips
  importEmoji() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      success: res => {
        const files = (res && res.tempFiles) || [];
        if (!files.length) { wx.showToast({ title: '未选择图片', icon: 'none' }); return; }
        let added = 0, skipped = 0;
        files.forEach(f => {
          if (f.size > 2 * 1024 * 1024) { skipped++; return; }
          const p = store.saveEmojiImage(f.tempFilePath);
          if (p) added++; else skipped++;
        });
        this.setData({ emojiList: this.buildEmojiList(this.data.selectedEmoji) });
        if (added) wx.showToast({ title: '已导入 ' + added + ' 张表情', icon: 'none' });
        if (skipped) wx.showToast({ title: skipped + ' 张图片超过 2MB 已跳过', icon: 'none' });
      }
    });
  },

  /* ---------------- 音色 chips ---------------- */
  buildVoiceList(selected) {
    return core.VOICES.map(v => ({
      value: v,
      phrase: core.VOICE_PHRASES[v] ? core.VOICE_PHRASES[v][0] : '',
      selected: v === selected
    }));
  },

  pickVoice(e) {
    const v = e.currentTarget.dataset.voice;
    // 从自定义录音切走时，若正在录音则静默停止（不保存）
    if (v !== '自定义录音' && this.data.recActive) this.stopRecording(true);
    this.setData({
      selectedVoice: v,
      voiceList: this.data.voiceList.map(x => ({
        value: x.value, phrase: x.phrase, selected: x.value === v
      }))
    });
  },

  /* ---------------- 自定义录音 ---------------- */
  initRecorder() {
    this._recManager = wx.getRecorderManager();
    this._recManager.onStop(res => this.onRecStop(res));
    this._recManager.onError(() => {
      this.clearRecTimer();
      this._recSilent = false;
      if (!this._destroyed) this.setData({ recActive: false, recTip: '录音失败，请检查麦克风权限' });
    });
  },

  toggleRecord() {
    if (this.data.recActive) { this.stopRecording(false); return; }
    this._recSilent = false;
    this._recSeconds = 0;
    this.setData({ recActive: true, recTime: '00:00', recTip: '正在录音…说完点停止' });
    try {
      this._recManager.start({ format: 'mp3', duration: REC_MAX_SECONDS * 1000 });
    } catch (e) {
      this.clearRecTimer();
      this.setData({ recActive: false, recTip: '无法启动录音，请检查权限' });
      return;
    }
    this._recTimer = setInterval(() => {
      this._recSeconds++;
      this.setData({
        recTime: core.pad(Math.floor(this._recSeconds / 60)) + ':' + core.pad(this._recSeconds % 60)
      });
      if (this._recSeconds >= REC_MAX_SECONDS) {
        wx.showToast({ title: '已达 30 秒上限，自动停止', icon: 'none' });
        this.stopRecording(false);
      }
    }, 1000);
  },

  stopRecording(silent) {
    if (!this.data.recActive) return;
    this._recSilent = !!silent;
    this.clearRecTimer();
    if (!this._destroyed) this.setData({ recActive: false });
    try { this._recManager.stop(); } catch (e) {}
  },

  clearRecTimer() {
    if (this._recTimer) { clearInterval(this._recTimer); this._recTimer = null; }
  },

  // 录音自然结束/手动停止回调：非静默时持久化到用户目录
  onRecStop(res) {
    this.clearRecTimer();
    const silent = this._recSilent;
    this._recSilent = false;
    if (silent || this._destroyed) return;
    const temp = res && res.tempFilePath;
    if (!temp) {
      this.setData({ recTip: '录音失败，请重试' });
      return;
    }
    const saved = store.saveRecording(temp);
    if (!saved) {
      this.setData({ recTip: '录音保存失败，请重试' });
      return;
    }
    if (this._recOwned && this._recPath && this._recPath !== saved) {
      store.deleteRecording(this._recPath); // 重录替换旧文件
    }
    this._recPath = saved;
    this._recOwned = true;
    this._saved = false;
    this.setData({ hasRecording: true, recTime: '00:00', recTip: REC_TIP_READY });
  },

  playRecording() {
    if (!this._recPath) return;
    if (!this._audio) this._audio = wx.createInnerAudioContext();
    try { this._audio.stop(); } catch (e) {}
    this._audio.src = this._recPath;
    this._audio.play();
  },

  // ✕ 重录：清空当前表单录音（本次新录的删除文件；编辑回填的仅解除引用，保存时才回收）
  clearRecording() {
    if (this._recPath && this._recOwned) store.deleteRecording(this._recPath);
    this._recPath = null;
    this._recOwned = false;
    this._saved = false;
    if (this._audio) { try { this._audio.stop(); } catch (e) {} }
    this.setData({ hasRecording: false, recTime: '00:00', recTip: REC_TIP_DEFAULT });
  },

  // onHide/onUnload 共用：停止录音（静默，不保存）并释放计时器/播放器
  teardownRecording() {
    if (this.data.recActive) this.stopRecording(true);
    this.clearRecTimer();
    if (this._audio) { try { this._audio.stop(); } catch (e) {} }
  },

  /* ---------------- 保存 ---------------- */
  saveEvent() {
    const d = this.data;
    const name = (d.form.name || '').trim();
    const note = (d.form.note || '').trim();
    const date = d.form.date;
    const time = d.form.time;

    if (!name) { wx.showToast({ title: '请填写事件名称', icon: 'none' }); return; }
    if (!date || !time) { wx.showToast({ title: '请选择提醒日期和时间', icon: 'none' }); return; }
    // 普通事件要求未来时间；生日每年触发，允许过去日期
    if (!d.isBirthday && new Date(date + 'T' + time + ':00') <= new Date()) {
      wx.showToast({ title: '请选择未来的日期和时间', icon: 'none' });
      return;
    }
    if (d.repeatMode === 'custom' && !d.weekdays.length) {
      wx.showToast({ title: '自定义重复请至少选择一个星期', icon: 'none' });
      return;
    }
    if (d.isBirthday && d.lunarBirthday) {
      try { lunar.solarToLunar(date); }
      catch (err) { wx.showToast({ title: '该日期无法换算农历', icon: 'none' }); return; }
    }

    const weekdays = d.repeatMode === 'none' ? [] : d.weekdays.slice().sort((a, b) => a - b);
    const old = d.editingId ? store.findEvent(d.editingId) : null;

    // 提示音数据：自定义录音存文件路径，其他提示音清除
    let voiceData = null;
    if (d.selectedVoice === '自定义录音' && this._recPath) voiceData = this._recPath;

    // 旧录音被替换/清除时回收文件
    if (old && typeof old.voiceData === 'string' && old.voiceData !== voiceData) {
      store.deleteRecording(old.voiceData);
    }
    if (this._recOwned && this._recPath && voiceData !== this._recPath) {
      store.deleteRecording(this._recPath); // 新录了但最终未采用
    }
    this._saved = true;

    let events = store.getEvents().slice();
    let ev;
    if (old) {
      const lunarOn = d.isBirthday ? d.lunarBirthday : false;
      const changedTime = old.date !== date || old.time !== time ||
        JSON.stringify(old.weekdays || []) !== JSON.stringify(weekdays) ||
        !!old.isBirthday !== d.isBirthday || !!old.lunarBirthday !== lunarOn;
      ev = Object.assign({}, old, {
        name: name, note: note, date: date, time: time,
        emoji: d.selectedEmoji, voice: d.selectedVoice, voiceData: voiceData,
        weekdays: weekdays, isBirthday: d.isBirthday, lunarBirthday: lunarOn
      });
      if (changedTime) { ev.doneOn = []; ev.firedOn = []; delete ev.snooze; }
      events = events.map(x => x.id === d.editingId ? ev : x);
      wx.showToast({ title: d.isBirthday ? '🎂 生日提醒已保存' : '修改已保存', icon: 'none' });
    } else {
      ev = {
        id: core.uid(), name: name, note: note, date: date, time: time,
        emoji: d.selectedEmoji, voice: d.selectedVoice, voiceData: voiceData,
        weekdays: weekdays, isBirthday: d.isBirthday,
        lunarBirthday: d.isBirthday ? d.lunarBirthday : false,
        doneOn: [], firedOn: []
      };
      events.push(ev);
      wx.showToast({
        title: d.isBirthday ? '🎂 生日提醒已保存' : ('提醒已保存：' + date + ' ' + time),
        icon: 'none'
      });
    }
    store.setEvents(events);
    wx.navigateBack({ fail: () => { wx.switchTab({ url: '/pages/home/home', fail: () => {} }); } });
  }
});
