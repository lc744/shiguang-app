// 绸缪 · 云函数 syncEvent —— 事件同步到云数据库（订阅消息推送的数据源）+ 跨端合并桥
// 客户端保存/删除事件时调用；按 (openid, eventId) 幂等 upsert
// 说明：reminders 集合只存推送最小字段；eventSync 集合存小程序事件镜像；
//       PG events 表（TCB）为安卓事件镜像 —— 跨端桥：小程序读写两侧（uid=wxUid(openid) 确定性推导），
//       安卓只读写 PG。环境变量 TCB_SECRET_ID/TCB_SECRET_KEY 未配置时 PG 桥自动降级（仅文档库）。
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COL = 'reminders';

// ---- TCB PG 直签（与 profileApi 同一套 TC3-HMAC-SHA256，密钥来自环境变量） ----
const TCB_HOST = 'tcb.tencentcloudapi.com';
function sha256hex(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function hmacBuf(key, s){ return crypto.createHmac('sha256', key).update(s).digest(); }
function pgEsc(s){ return String(s).replace(/'/g, "''"); }
function wxUidOf(openid){ return 'wx_' + sha256hex('choumou-wx:' + openid).slice(0, 24); }
function pgReady(){ return !!(process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY); }

function pgCall(action, payload){
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload || {});
  const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + TCB_HOST + '\nx-tc-action:' + action.toLowerCase() + '\n';
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = 'POST' + '\n' + '/' + '\n' + '' + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + sha256hex(body);
  const stringToSign = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/tcb/tc3_request\n' + sha256hex(canonicalRequest);
  const kDate = hmacBuf('TC3' + process.env.TCB_SECRET_KEY, date);
  const kSigning = hmacBuf(hmacBuf(kDate, 'tcb'), 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const auth = 'TC3-HMAC-SHA256 Credential=' + process.env.TCB_SECRET_ID + '/' + date + '/tcb/tc3_request, SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: TCB_HOST, path: '/', method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': TCB_HOST,
        'X-TC-Action': action,
        'X-TC-Region': 'ap-shanghai',
        'X-TC-Timestamp': String(ts),
        'X-TC-Version': '2018-06-08',
        'Authorization': auth,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 12000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try{
          const j = JSON.parse(d);
          if(j.Response && j.Response.Error) return reject(new Error(j.Response.Error.Code + ' ' + j.Response.Error.Message));
          resolve(j.Response || {});
        }catch(e){ reject(new Error('响应解析失败')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('PG API超时')); });
    req.write(body);
    req.end();
  });
}

// 安卓侧事件镜像：PG upsert（updatedAt 幂等，同 id 双端写时后者赢）
async function pgUpsertEvent(uid, e){
  const ua = Number.isFinite(Number(e.updatedAt)) ? Number(e.updatedAt) : Date.now();
  const data = pgEsc(JSON.stringify(e));
  await pgCall('ExecutePGSql', { EnvId: process.env.TCB_ENV || 'gerenceshi-d0gguq5u39b4b86b2', Sql:
    "INSERT INTO events (id, uid, data, updated_at) VALUES ('" + pgEsc(e.id) + "', '" + pgEsc(uid) + "', '" + data + "', " + ua + ") " +
    "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at WHERE events.updated_at < EXCLUDED.updated_at" });
}

// 读安卓侧镜像（uid = wxUid(OPENID)，即安卓"微信登录"账号）
async function pgPullEvents(uid){
  const r = await pgCall('ExecutePGSql', { EnvId: process.env.TCB_ENV || 'gerenceshi-d0gguq5u39b4b86b2', Sql:
    "SELECT data FROM events WHERE uid = '" + pgEsc(uid) + "' LIMIT 1000" });
  // Rows 每行是"字符串化的值数组"：双层解析得 [data字符串]，data 字符串再 parse 成事件对象
  return (r && r.Rows ? r.Rows : []).map(line => {
    try{
      const arr = JSON.parse(JSON.parse(line));
      const v = arr[0];
      return typeof v === 'string' ? JSON.parse(v) : v;
    }catch(e){ return null; }
  }).filter(Boolean);
}

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
      // 跨端桥：安卓镜像 uid（微信登录账号），由 openid 确定性推导；PG 不可用时自动降级
      let bridgeUid = null;
      if(pgReady()){ try{ await pgCall('ExecutePGSql', { EnvId: process.env.TCB_ENV || 'gerenceshi-d0gguq5u39b4b86b2', Sql: "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, uid TEXT, data TEXT, updated_at BIGINT DEFAULT 0)" }); bridgeUid = wxUidOf(OPENID); }catch(e2){ bridgeUid = null; } }
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
          // 镜像到 PG（安卓可拉取）；云端较新才写
          if(bridgeUid){
            try{
              await pgUpsertEvent(bridgeUid, e);
            }catch(e3){ /* 单条失败继续 */ }
          }
        }catch(e2){ /* 单条失败继续 */ }
      }
      return { ok: true, op: 'pushAll', saved, bridge: !!bridgeUid };
    }

    if(action === 'pullAll'){
      try{ await db.createCollection(SYNC); }catch(e2){ /* 已存在则忽略 */ }
      const MAX = 1000;
      const res = await db.collection(SYNC).where({ owner: OPENID }).limit(MAX).get();
      const mine = res.data || [];
      // 跨端桥：并入安卓侧 PG 镜像（同 id 按 updatedAt 归并）
      let bridge = false;
      let out = mine;
      if(pgReady()){
        try{
          const pgEvents = await pgPullEvents(wxUidOf(OPENID));
          bridge = true;
          const byId = {};
          mine.forEach(m => { if(m && m.id) byId[m.id] = m; });
          (pgEvents || []).forEach(pd => {
            if(!pd || !pd.id) return;
            const cur = byId[pd.id];
            if(!cur) byId[pd.id] = pd;
            else if((Number(pd.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) byId[pd.id] = pd;
          });
          out = Object.keys(byId).map(k => byId[k]);
        }catch(e2){ bridge = false; }
      }
      return { ok: true, op: 'pullAll', events: out, bridge };
    }

    if(action === 'delOne'){
      await db.collection(SYNC).where({ owner: OPENID, id: String(event.eventId || '') }).remove();
      // 跨端桥：PG 镜像一并删除
      if(pgReady()){ try{ await pgCall('ExecutePGSql', { EnvId: process.env.TCB_ENV || 'gerenceshi-d0gguq5u39b4b86b2', Sql: "DELETE FROM events WHERE id = '" + pgEsc(String(event.eventId || '')) + "' AND uid = '" + pgEsc(wxUidOf(OPENID)) + "'" }); }catch(e2){ /* 静默 */ } }
      return { ok: true, op: 'delOne' };
    }

    return { ok: false, error: 'unknown action' };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
