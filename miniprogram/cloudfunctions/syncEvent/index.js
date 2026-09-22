// 绸缪 · 云函数 syncEvent —— 事件同步到云数据库（订阅消息推送的数据源）
// 客户端保存/删除事件时调用；按 (openid, eventId) 幂等 upsert
// 说明：只同步推送所需最小字段，敏感的备注/语音/表情不上云
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COL = 'reminders';

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if(!OPENID) return { ok: false, error: 'no openid' };
  const action = event && event.action;
  try{
    try{ await db.createCollection(COL); }catch(e){ /* 已存在则忽略 */ }

    if(action === 'upsert'){
      const e = (event && event.event) || {};
      if(!e.id || typeof e.id !== 'string') return { ok: false, error: 'bad id' };
      if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || !/^\d{2}:\d{2}$/.test(e.time || '')) return { ok: false, error: 'bad date/time' };
      const weekdays = Array.isArray(e.weekdays) ? e.weekdays : [];
      const doc = {
        openid: OPENID,
        eventId: e.id,
        name: String(e.name || '').slice(0, 20),
        when: e.date + ' ' + e.time,
        dueStamp: e.date + 'T' + e.time,
        doneOn: Array.isArray(e.doneOn) ? e.doneOn.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) : [],
        weekdays: weekdays,
        isBirthday: !!e.isBirthday,
        // 提醒方式（方案C'）：subscribe=微信服务通知 / both=两端 / app=仅App闹钟；缺省视为 subscribe（兼容存量）
        remindVia: ['subscribe', 'both', 'app'].indexOf(e.remindVia) >= 0 ? e.remindVia : 'subscribe',
        // v1 只对"单次事件"做云端推送；weekday/生日重复事件仍由本地前台弹窗负责
        oneShot: weekdays.length === 0 && !e.isBirthday,
        fired: false,
        updatedAt: Date.now()
      };
      const found = await db.collection(COL).where({ openid: OPENID, eventId: e.id }).get();
      const patch = {
        eventId: doc.eventId, name: doc.name, when: doc.when, dueStamp: doc.dueStamp,
        doneOn: doc.doneOn, weekdays: doc.weekdays, isBirthday: doc.isBirthday,
        oneShot: doc.oneShot, fired: doc.fired, updatedAt: doc.updatedAt
      };
      if(found.data.length){
        await db.collection(COL).doc(found.data[0]._id).update({ data: patch });
      } else {
        await db.collection(COL).add({ data: doc });
      }
      return { ok: true, op: 'upsert' };
    }

    if(action === 'delete'){
      await db.collection(COL).where({ openid: OPENID, eventId: String(event.eventId || '') }).remove();
      return { ok: true, op: 'delete' };
    }

    if(action === 'get'){
      const found = await db.collection(COL).where({ openid: OPENID, eventId: String(event.eventId || '') }).get();
      if(!found.data.length) return { ok: true, found: false };
      const d = found.data[0];
      return { ok: true, found: true, fired: !!d.fired, name: d.name, when: d.when, dueStamp: d.dueStamp };
    }

    if(action === 'deleteAll'){
      await db.collection(COL).where({ openid: OPENID }).remove();
      return { ok: true, op: 'deleteAll' };
    }

    // ===== 事件全量镜像同步（eventSync 集合，owner=openid，_id=事件id 幂等）=====
    const SYNC = 'eventSync';
    const cleanEvent = (e) => {
      // 全量镜像但剔除本地资源：voiceData(录音dataUrl，体积大且跨端不可用)
      const clone = Object.assign({}, e);
      delete clone.voiceData;
      if(!Number.isFinite(clone.updatedAt)) clone.updatedAt = Date.now();
      return clone;
    };

    if(action === 'pushAll'){
      try{ await db.createCollection(SYNC); }catch(e2){ /* 已存在则忽略 */ }
      const list = Array.isArray(event.events) ? event.events : [];
      let saved = 0;
      for(const raw of list){
        if(!raw || typeof raw.id !== 'string' || !raw.id) continue;
        const e = cleanEvent(raw);
        try{
          const found = await db.collection(SYNC).where({ owner: OPENID, id: e.id }).limit(1).get();
          if(found.data.length){
            const cloudUpdatedAt = Number(found.data[0].updatedAt) || 0;
            if(Number(e.updatedAt) >= cloudUpdatedAt){
              await db.collection(SYNC).doc(found.data[0]._id).update({ data: Object.assign({}, e, { owner: OPENID }) });
              saved++;
            }
          } else {
            await db.collection(SYNC).add({ data: Object.assign({}, e, { owner: OPENID }) });
            saved++;
          }
        }catch(e2){ /* 单条失败继续 */ }
      }
      return { ok: true, op: 'pushAll', saved };
    }

    if(action === 'pullAll'){
      try{ await db.createCollection(SYNC); }catch(e2){ /* 已存在则忽略 */ }
      const MAX = 1000;
      const res = await db.collection(SYNC).where({ owner: OPENID }).limit(MAX).get();
      return { ok: true, op: 'pullAll', events: res.data || [] };
    }

    if(action === 'delOne'){
      await db.collection(SYNC).where({ owner: OPENID, id: String(event.eventId || '') }).remove();
      return { ok: true, op: 'delOne' };
    }

    return { ok: false, error: 'unknown action' };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
