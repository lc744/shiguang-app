// 绸缪小程序 · 设置页 —— 移植自 Web 版 settings.js
// （主题/背景、自动备份、剪贴板导入导出、说明卡、清空）
const core = require('../../utils/core');
const store = require('../../utils/store');

function formatAt(at) {
  try {
    const d = new Date(at);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + core.pad(d.getHours()) + ':' + core.pad(d.getMinutes());
  } catch (e) { return String(at); }
}

Page({
  data: {
    themeClass: '',
    bgColor: '#eef4f1',
    theme: 'system',
    themes: [
      { t: 'system', label: '跟随系统' },
      { t: 'light', label: '浅色' },
      { t: 'dark', label: '深色' }
    ],
    defaultColors: [],
    bgColorValue: '',
    backups: []
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor,
      theme: app.globalData.theme,
      defaultColors: app.globalData.defaultColors,
      bgColorValue: app.globalData.bgColor
    });
    this.refreshBackups();
  },

  refreshBackups() {
    const list = store.listBackups().map(b => ({
      at: b.at,
      atLabel: formatAt(b.at),
      count: b.count
    }));
    this.setData({ backups: list });
  },

  /* ---------------- 外观主题 ---------------- */
  pickTheme(e) {
    const app = getApp();
    const t = e.currentTarget.dataset.theme;
    app.setTheme(t);
    this.setData({
      theme: t,
      themeClass: app.globalData.resolvedTheme === 'dark' ? 'theme-dark' : '',
      bgColor: app.globalData.bgColor
    });
    wx.showToast({
      title: t === 'dark' ? '已切换深色模式' : (t === 'light' ? '已切换浅色模式' : '已切换跟随系统'),
      icon: 'none'
    });
  },

  /* ---------------- 背景颜色 ---------------- */
  pickBgColor(e) {
    const app = getApp();
    const color = e.currentTarget.dataset.color;
    app.setBgColor(color);
    this.setData({ bgColor: color, bgColorValue: color });
    wx.showToast({ title: '背景已更改为 ' + color, icon: 'none' });
  },

  /* ---------------- 自动备份 ---------------- */
  restoreBackupEntry(e) {
    const at = e.currentTarget.dataset.at;
    const entry = store.listBackups().find(x => x.at === at);
    if (!entry) { wx.showToast({ title: '备份不存在', icon: 'none' }); return; }
    const n = store.getEvents().length;
    wx.showModal({
      title: '恢复备份',
      content: '恢复到 ' + formatAt(at) + ' 的快照？当前 ' + n + ' 个事件将被替换。',
      confirmText: '恢复',
      success: r => {
        if (!r.confirm) return;
        const res = store.restoreBackup(entry);
        if (res.ok) {
          this.refreshBackups();
          wx.showToast({ title: '已恢复 ' + res.n + ' 个事件', icon: 'none' });
        } else {
          wx.showToast({ title: '恢复失败', icon: 'none' });
        }
      }
    });
  },

  removeBackupEntry(e) {
    const at = e.currentTarget.dataset.at;
    wx.showModal({
      title: '删除备份',
      content: '删除这条备份快照？',
      confirmText: '删除',
      success: r => {
        if (!r.confirm) return;
        store.deleteBackup(at);
        this.refreshBackups();
        wx.showToast({ title: '已删除备份快照', icon: 'none' });
      }
    });
  },

  /* ---------------- 导出 / 导入（剪贴板方案） ---------------- */
  exportData() {
    try {
      const events = store.getEvents();
      const payload = {
        app: 'shiguang',
        version: 3,
        exportedAt: new Date().toISOString(),
        count: events.length,
        events: events
      };
      wx.setClipboardData({
        data: JSON.stringify(payload, null, 2),
        success: () => wx.showToast({ title: '备份已复制到剪贴板', icon: 'none' }),
        fail: () => wx.showToast({ title: '导出失败：无法写入剪贴板', icon: 'none' })
      });
    } catch (e) {
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  importData() {
    wx.getClipboardData({
      success: res => {
        let data = null;
        try { data = JSON.parse(res.data); } catch (err) { data = null; }
        if (!data || data.app !== 'shiguang' || !Array.isArray(data.events)) {
          wx.showToast({ title: '剪贴板内容不是有效的绸缪备份', icon: 'none' });
          return;
        }
        const incoming = [];
        data.events.forEach(raw => {
          const e = store.sanitizeEvent(raw);
          if (e) incoming.push(e);
        });
        if (!incoming.length) {
          wx.showToast({ title: '导入失败：备份中没有有效事件', icon: 'none' });
          return;
        }
        const byId = new Map(store.getEvents().map(x => [x.id, x]));
        let added = 0, merged = 0;
        incoming.forEach(x => {
          if (byId.has(x.id)) merged++; else added++;
          byId.set(x.id, x);
        });
        store.setEvents(Array.from(byId.values()));
        this.refreshBackups();
        wx.showToast({ title: '导入成功：新增 ' + added + '，更新 ' + merged, icon: 'none' });
      },
      fail: () => wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
    });
  },

  /* ---------------- 清空全部事件 ---------------- */
  clearAll() {
    const n = store.getEvents().length;
    if (!n) { wx.showToast({ title: '当前没有事件', icon: 'none' }); return; }
    wx.showModal({
      title: '清空全部事件',
      content: '确定清空全部 ' + n + ' 个事件吗？删除后可通过自动备份或剪贴板备份恢复。',
      confirmText: '清空',
      confirmColor: '#c65c52',
      success: r => {
        if (!r.confirm) return;
        store.getEvents().forEach(e => store.deleteRecording(e.voiceData)); // 一并回收录音文件
        store.setEvents([]);
        this.refreshBackups();
        wx.showToast({ title: '已清空全部事件', icon: 'none' });
      }
    });
  }
});
