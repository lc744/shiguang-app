// 绸缪小程序 · 纯逻辑层（常量、日期、重复规则）——移植自 Web 版 core.js，无 DOM 依赖
const EMOJIS = ['🐶 收工啦','🐹 加油','🐨 轻松一下','🐼 早点休息','🐰 动一动','🐱 完成啦','🐸 喝水','🦉 晚安','🦄 好运','🐯 冲刺','🐙 灵感','🦊 太棒了','🐳 深呼吸','🐝 专注','🦋 放松','🌈 开心'];
const VOICES = ['甜美学妹','阳光少女','软萌少女','清新校园','温柔同桌','活泼班长','治愈少女','俏皮助手','清甜女声','元气萌声','自然女声','温柔姐姐','知性女声','轻快少女','甜美小贝','温柔小妮','清爽晓晓','端庄小艺','磁性男声','阳光男声','温和男声','厚重男声','沉稳男声','活力男声','标准播报','仅铃声','自定义录音'];
const VOICE_PHRASES = {
  '甜美学妹':['学长学姐，温馨提醒哦'],'阳光少女':['元气满满，该行动啦'],'软萌少女':['叮咚，不要忘记哦'],
  '清新校园':['绸缪提醒你'],'温柔同桌':['轻轻提醒你一下'],'活泼班长':['注意啦，现在开始完成任务'],
  '治愈少女':['慢慢来，记得处理这项安排'],'俏皮助手':['嗨，你有一件事情要做'],
  '清甜女声':['温馨提醒'],'元气萌声':['叮咚，该行动啦'],'自然女声':['绸缪提醒'],
  '温柔姐姐':['轻轻提醒你'],'知性女声':['温馨提醒，请注意时间安排'],'轻快少女':['嗨，有事情要记住哦'],
  '甜美小贝':['你好呀，温馨提醒'],'温柔小妮':['要记住这件事情哦'],'清爽晓晓':['叮，提醒来啦'],'端庄小艺':['绸缪提醒你，请注意'],
  '磁性男声':['请注意，你有一项安排'],'阳光男声':['加油，现在开始完成它'],'温和男声':['记得处理这项安排'],'厚重男声':['重要提醒，请及时完成'],
  '沉稳男声':['请注意，你有一项安排'],'活力男声':['加油，现在开始完成它'],
  '标准播报':['绸缪提醒'],'仅铃声':['仅播放闹钟铃声']
};
const WD_NAMES = ['','一','二','三','四','五','六','日'];

function pad(n){ return String(n).padStart(2,'0'); }
function todayStr(d){ d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function weekdayOf(dateStr){ const d = new Date(dateStr + 'T00:00:00'); return d.getDay() === 0 ? 7 : d.getDay(); }

// 生日事件：每年一次（支持农历）；重复事件：按 weekdays；否则仅当天
function occursOn(e, ds){
  if(e.isBirthday){
    if(e.lunarBirthday){
      const lunar = require('./lunar');
      const cur = lunar.solarToLunar(ds);
      const base = lunar.solarToLunar(e.date);
      return !cur.isLeap && !base.isLeap && cur.month === base.month && cur.day === base.day;
    }
    return ds.slice(5) === e.date.slice(5) && ds >= e.date;
  }
  if(!e.weekdays || !e.weekdays.length) return e.date === ds;
  if(ds < e.date) return false;
  return e.weekdays.includes(weekdayOf(ds));
}

function isDoneOn(e, ds){ return (e.doneOn || []).includes(ds); }

function repeatLabel(e){
  if(e.isBirthday) return e.lunarBirthday ? '农历生日' : '生日';
  if(!e.weekdays || !e.weekdays.length) return '';
  if(e.weekdays.length === 7) return '每天';
  const wk = [1,2,3,4,5];
  if(e.weekdays.length === 5 && wk.every(d => e.weekdays.includes(d))) return '周一到周五';
  return '周' + e.weekdays.slice().sort().map(d => WD_NAMES[d]).join('、');
}

// 重复事件：从 from 起找下一个生效日（含 from），找不到返回 null
function nextOccur(e, from){
  if(!e.weekdays || !e.weekdays.length) return e.date >= from ? e.date : null;
  const fromD = new Date(from + 'T00:00:00');
  for(let i = 0; i < 370; i++){
    const d = new Date(fromD.getTime() + i*86400000);
    const ds = todayStr(d);
    if(occursOn(e, ds)) return ds;
  }
  return null;
}

// 旧版内置示例事件模板：用于一次性清理
function isDemoSeed(e){
  const seeds = [
    {name:'提交周报',note:'整理本周项目进度和下周计划',time:'09:30',emoji:'🐹 打工人加油'},
    {name:'午休散步',note:'离开电脑 20 分钟，去楼下走走',time:'12:00',emoji:'🐨 轻松一下'},
    {name:'下班',note:'收拾桌面，关闭电脑，准时回家',time:'18:00',emoji:'🐶 收工啦'},
    {name:'牙医预约',note:'记得带医保卡',time:'10:00',emoji:'🐼 早点休息'}
  ];
  return seeds.some(s => e.name===s.name && e.note===s.note && e.time===s.time && e.emoji===s.emoji);
}

function notificationText(e){
  if(e.isBirthday) return ('🎂 今天是「' + e.name + '」的生日，祝生日快乐！' + (e.note || '')).trim();
  const phrase = e.voice && VOICE_PHRASES[e.voice] ? VOICE_PHRASES[e.voice][0] : '';
  return ([phrase, e.note].filter(Boolean).join('：')) || '到点提醒';
}

module.exports = { EMOJIS, VOICES, VOICE_PHRASES, WD_NAMES, pad, todayStr, uid, weekdayOf, occursOn, isDoneOn, repeatLabel, nextOccur, isDemoSeed, notificationText };
