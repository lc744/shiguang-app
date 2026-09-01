// 绸缪小程序 · 日期/时间展示辅助（home/upcoming/calendar/detail 共用）——移植自 Web 版 ui.js
const core = require('./core');

const WD_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

// HH:MM → 时段文案
function periodOf(hhmm){
  const h = parseInt(hhmm, 10);
  if(h < 6) return '凌晨';
  if(h < 12) return '上午';
  if(h < 14) return '中午';
  if(h < 18) return '下午';
  return '晚上';
}

// 日期 → 展示文案：今天 / 明天 / 后天 / MM月DD日 周X
function dateLabel(dateStr){
  const t = core.todayStr();
  if(dateStr === t) return '今天';
  if(dateStr === core.todayStr(new Date(Date.now() + 86400000))) return '明天';
  if(dateStr === core.todayStr(new Date(Date.now() + 2 * 86400000))) return '后天';
  const d = new Date(dateStr + 'T00:00:00');
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WD_NAMES[d.getDay()];
}

// 距离某日期的天数（0 = 今天）
function daysUntil(dateStr){
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - now) / 86400000);
}

module.exports = { periodOf, dateLabel, daysUntil };
