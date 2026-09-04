// 绸缪 · 云函数 pushDue —— 定时触发（每分钟），扫描到点的一次性事件发送订阅消息
// 模板配置在 secret.json（templateId / miniprogramState / fieldMap），已 gitignore
// 触发器声明在同目录 config.json（每分钟一次）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COL = 'reminders';

let cfg = null;
try{ cfg = require('./secret.json'); }catch(e){ cfg = null; }
const TEMPLATE_ID = process.env.SUBSCRIBE_TEMPLATE_ID || (cfg && cfg.templateId) || '';
const STATE = (cfg && cfg.miniprogramState) || 'trial';   // 上线后改 'formal'
// 模板字段映射：模板关键词 key → 数据来源
//   name = 事件名（thing 类，≤20字）
//   when = 中文日期时间（time 类，如"2026年9月5日 19:00"）
//   date = 中文日期（date 类，如"2026年9月5日"）
const FIELD_MAP = (cfg && cfg.fieldMap) || { thing2: 'name', time3: 'when', date4: 'date' };

function cnDateParts(when){
  const m = String(when || '').split(' ');
  const dp = (m[0] || '').split('-');
  if(dp.length < 3) return null;
  return { y: parseInt(dp[0], 10), mo: parseInt(dp[1], 10), d: parseInt(dp[2], 10), t: m[1] || '' };
}

async function markFired(id){
  // 用 where(_id) 更新而非 doc(id)：doc() 对不存在的 _id 可能静默空转，where 版本会返回匹配数便于诊断
  const r = await db.collection(COL).where({ _id: id }).update({ data: { fired: true } });
  if(!r.stats || !r.stats.updated){ throw new Error('markFired matched 0 docs for _id=' + id); }
  return r.stats;
}

exports.main = async () => {
  if(!TEMPLATE_ID) return { ok: false, skipped: 'template not configured' };
  // 云函数服务器时区不保证是北京时间：统一用 UTC+8 墙钟，与客户端本地时间对齐
  const now = new Date(Date.now() + 8 * 3600000);
  const p2 = n => String(n).padStart(2, '0');
  const today = now.getUTCFullYear() + '-' + p2(now.getUTCMonth() + 1) + '-' + p2(now.getUTCDate());
  const nowStamp = today + 'T' + p2(now.getUTCHours()) + ':' + p2(now.getUTCMinutes());
  let sent = 0, skipped = 0, failed = 0, total = 0;
  const errors = [];
  try{
    const res = await db.collection(COL).where({ fired: false }).limit(200).get();
    total = res.data.length;
    for(const doc of res.data){
      try{
        if(String(doc.dueStamp) > nowStamp){ skipped++; continue; }                              // 未到点
        if(!doc.oneShot){ await markFired(doc._id); skipped++; continue; }                       // 重复/生日不推
        if((doc.doneOn || []).indexOf(today) >= 0){ await markFired(doc._id); skipped++; continue; } // 已完成
        if(String(doc.dueStamp).slice(0, 10) !== today){ await markFired(doc._id); skipped++; continue; } // 过期不再打扰
        const data = {};
        Object.keys(FIELD_MAP).forEach(k => {
          const src = FIELD_MAP[k];
          let v = '';
          if(src === 'name'){ v = String(doc.name || ''); }
          else {
            const p = cnDateParts(doc.when);
            if(p){
              if(src === 'when'){ v = p.y + '年' + p.mo + '月' + p.d + '日 ' + p.t; }
              else if(src === 'date'){ v = p.y + '年' + p.mo + '月' + p.d + '日'; }
            }
          }
          data[k] = { value: v };
        });
        await cloud.openapi.subscribeMessage.send({
          touser: doc.openid,
          templateId: TEMPLATE_ID,
          page: '/pages/remind/remind?id=' + doc.eventId,
          data: data,
          miniprogramState: STATE
        });
        sent++;
        await markFired(doc._id);
      }catch(e){
        failed++;
        const msg = String((e && (e.errMsg || e.message)) || '');
        errors.push((doc.eventId || doc._id || '?') + ' → ' + msg.slice(0, 120));
        if(/43101|refuse|quota/i.test(msg)){ try{ await markFired(doc._id); }catch(e2){ errors.push('markFired also failed: ' + String(e2 && e2.message || e2).slice(0, 80)); } }
      }
    }
    return { ok: true, total, sent, skipped, failed, errors, nowStamp };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
