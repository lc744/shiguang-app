// 绸缪小程序 · 到点提醒逻辑（纯判断，页面/入口负责触发）——移植自 Web 版 reminder.js
const core = require('./core');
const store = require('./store');

// 找出当前应触发的提醒：多个到点时优先设定时间最晚（等待最久、最紧迫）的那个
function findDue(){
  const now = new Date();
  const t = core.todayStr();
  const nowHHMM = core.pad(now.getHours()) + ':' + core.pad(now.getMinutes());
  const nowStamp = t + 'T' + nowHHMM;
  const events = store.getEvents();
  const isDue = e => {
    // 贪睡覆盖：到达贪睡时间即触发（一次性）
    if(e.snooze){
      if(e.snooze <= nowStamp) return !(e.firedOn||[]).includes('snooze:' + e.snooze);
      return false;
    }
    // 正常触发：今天发生、未完成、未在今天触发过、时间已到
    if(!core.occursOn(e, t) || core.isDoneOn(e, t)) return false;
    if((e.firedOn||[]).includes(t)) return false;
    return e.time <= nowHHMM;
  };
  return events.filter(isDue).sort((a,b) => b.time.localeCompare(a.time))[0] || null;
}

// 标记事件为已触发（正常触发记日期，贪睡记 snooze 键）
function markFired(e){
  const t = core.todayStr();
  const nowStamp = t + 'T' + core.pad(new Date().getHours()) + ':' + core.pad(new Date().getMinutes());
  if(e.snooze && e.snooze <= nowStamp){
    e.firedOn = e.firedOn || [];
    e.firedOn.push('snooze:' + e.snooze);
    delete e.snooze;
  } else {
    e.firedOn = e.firedOn || [];
    e.firedOn.push(t);
  }
  store.persist();
}

// 扫描今天已到点但从未触发且未完成的事件（错过提醒横幅用）
function scanMissed(){
  const t = core.todayStr();
  const nowHHMM = core.pad(new Date().getHours()) + ':' + core.pad(new Date().getMinutes());
  return store.getEvents().filter(e => {
    if(!core.occursOn(e, t) || core.isDoneOn(e, t)) return false;
    if(e.snooze) return false;
    if((e.firedOn||[]).includes(t)) return false;
    return e.time <= nowHHMM;
  }).sort((a,b) => a.time.localeCompare(b.time));
}

// 贪睡：延后 minutes 分钟
function snoozeEvent(e, minutes){
  minutes = minutes || 10;
  const d = new Date(Date.now() + minutes*60000);
  e.snooze = core.todayStr(d) + 'T' + core.pad(d.getHours()) + ':' + core.pad(d.getMinutes());
  store.persist();
  return e.snooze;
}

// 标记完成（今天）
function completeToday(e){
  const t = core.todayStr();
  if(core.occursOn(e, t) && !(e.doneOn||[]).includes(t)){
    e.doneOn = e.doneOn || [];
    e.doneOn.push(t);
    store.persist();
    return true;
  }
  return false;
}

module.exports = { findDue, markFired, scanMissed, snoozeEvent, completeToday };
