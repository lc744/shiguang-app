// 绸缪小程序 · 日历页（月历网格 + 当日议程 + 年月选择弹层）
const core = require('../../utils/core');
const store = require('../../utils/store');
const lunar = require('../../utils/lunar');
const format = require('../../utils/format');

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

Page({
  data: {
    themeClass: '',
    bgColor: '#eef4f1',
    weekdays: WEEKDAYS,
    monthTitle: '',
    days: [],
    agendaTitle: '',
    agendaCount: '',
    agendaList: [],
    agendaEmpty: false,
    pickerVisible: false,
    pickerYear: 2026,
    months: []
  },

  onLoad(){
    const d = new Date();
    this._calYear = d.getFullYear();
    this._calMonth = d.getMonth();
    this._selDate = core.todayStr();
    this._pickerYear = this._calYear;
  },

  onShow(){
    const app = getApp();
    this.setData({
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor
    });
    // 从编辑/详情页返回后自动刷新事件数据
    this.renderCalendar();
  },

  /* ---------------- 月历 ---------------- */
  renderCalendar(){
    const calYear = this._calYear;
    const calMonth = this._calMonth;
    const events = store.getEvents();
    const t = core.todayStr();
    const first = new Date(calYear, calMonth, 1);
    const startCol = (first.getDay() + 6) % 7; // 周一为一周起点
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const days = [];
    let i;
    for(i = 0; i < startCol; i++){
      days.push({ key: 'pad-' + i, pad: true, cls: 'day pad' });
    }
    for(let day = 1; day <= daysInMonth; day++){
      const ds = calYear + '-' + core.pad(calMonth + 1) + '-' + core.pad(day);
      const dayEvents = events.filter(e => core.occursOn(e, ds));
      const n = dayEvents.length;
      const hasBirthday = dayEvents.some(e => e.isBirthday);
      const fest = lunar.festivalOf(ds) || lunar.computedFestival(ds);
      // 法定休/班：LEGAL_HOLIDAYS 未单独导出，通过 dayFullLabel 的后缀判断
      const full = lunar.dayFullLabel(ds);
      const isRest = full.indexOf('法定假日') >= 0;
      const isWork = full.indexOf('调休上班') >= 0;
      const cls = ['day'];
      if(ds === t) cls.push('today');
      if(n) cls.push('has-event');
      if(ds === this._selDate) cls.push('selected');
      if(fest) cls.push('has-festival');
      if(isRest) cls.push('legal-rest');
      if(isWork) cls.push('legal-work');
      // 角标：法定休/班优先，其次事件数，今天显示“今”
      let mark = '';
      if(isRest) mark = '休';
      else if(isWork) mark = '班';
      else if(ds === t) mark = '今';
      else if(n) mark = String(n);
      days.push({
        key: ds,
        pad: false,
        ds: ds,
        cls: cls.join(' '),
        main: hasBirthday ? '🎂' : String(day),
        sub: fest || lunar.lunarDayLabel(lunar.solarToLunar(ds)),
        mark: mark
      });
    }
    this.setData({
      monthTitle: calYear + ' 年 ' + (calMonth + 1) + ' 月',
      days: days
    });
    this.renderAgenda();
  },

  onChangeMonth(e){
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    if(delta === 0){
      const d = new Date();
      this._calYear = d.getFullYear();
      this._calMonth = d.getMonth();
    } else {
      let m = this._calMonth + delta;
      if(m < 0){ m = 11; this._calYear--; }
      if(m > 11){ m = 0; this._calYear++; }
      this._calMonth = m;
    }
    this.renderCalendar();
  },

  onPickDay(e){
    this._selDate = e.currentTarget.dataset.ds;
    this.renderCalendar();
    wx.showToast({ title: '已切换到 ' + format.dateLabel(this._selDate), icon: 'none' });
  },

  /* ---------------- 当日议程 ---------------- */
  renderAgenda(){
    const selDate = this._selDate;
    const items = store.getEvents().filter(e => core.occursOn(e, selDate))
      .sort((a, b) => a.time.localeCompare(b.time));
    const agendaList = items.map(e => {
      const repeat = core.repeatLabel(e);
      return {
        id: e.id,
        name: (e.isBirthday ? '🎂 ' : '') + (core.isDoneOn(e, selDate) ? '✓ ' : '') + e.name,
        sub: e.time + ' · ' + format.periodOf(e.time) + (repeat ? ' · ↻ ' + repeat : '')
      };
    });
    this.setData({
      agendaTitle: format.dateLabel(selDate) + ' · ' + lunar.dayFullLabel(selDate),
      agendaCount: items.length + ' 个事件',
      agendaList: agendaList,
      agendaEmpty: items.length === 0
    });
  },

  onAgendaTap(e){ wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },

  /* ---------------- 年月选择弹层 ---------------- */
  openMonthPicker(){
    this._pickerYear = this._calYear;
    this.setData({ pickerVisible: true, pickerYear: this._pickerYear });
    this.renderMonthPicker();
  },

  closeMonthPicker(){ this.setData({ pickerVisible: false }); },

  // 拦截弹层卡片上的点击冒泡，保证点遮罩才关闭
  noop(){},

  shiftPickerYear(e){
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    let y = this._pickerYear + delta;
    if(y < 1901) y = 1901;
    if(y > 2099) y = 2099;
    this._pickerYear = y;
    this.setData({ pickerYear: y });
    this.renderMonthPicker();
  },

  renderMonthPicker(){
    const now = new Date();
    const isThisYear = this._pickerYear === now.getFullYear();
    const months = [];
    for(let i = 0; i < 12; i++){
      const cls = ['yp-month'];
      if(isThisYear && i === now.getMonth()) cls.push('yp-current');
      if(this._pickerYear === this._calYear && i === this._calMonth) cls.push('yp-selected');
      months.push({ m: i, cls: cls.join(' ') });
    }
    this.setData({ months: months });
  },

  pickMonth(e){
    const m = Number(e.currentTarget.dataset.m);
    this._calYear = this._pickerYear;
    this._calMonth = m;
    this.setData({ pickerVisible: false });
    this.renderCalendar();
    wx.showToast({ title: this._calYear + ' 年 ' + (m + 1) + ' 月', icon: 'none' });
  },

  jumpToTodayMonth(){
    const d = new Date();
    this._calYear = d.getFullYear();
    this._calMonth = d.getMonth();
    this.setData({ pickerVisible: false });
    this.renderCalendar();
    wx.showToast({ title: '已回到本月', icon: 'none' });
  },

  onAddTap(){ wx.navigateTo({ url: '/pages/editor/editor' }); }
});
