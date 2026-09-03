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
// 模板字段映射：模板字段 key → 数据来源（name=事件名 / when=时间串）。创建模板后按实际字段调整
const FIELD_MAP = (cfg && cfg.fieldMap) || { thing1: 'name', time2: 'when' };

async function markFired(id){
  await db.collection(COL).doc(id).update({ data: { fired: true } });
}

exports.main = async () => {
  if(!TEMPLATE_ID) return { ok: false, skipped: 'template not configured' };
  const now = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const today = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
  const nowStamp = today + 'T' + p2(now.getHours()) + ':' + p2(now.getMinutes());
  let sent = 0, skipped = 0, failed = 0, total = 0;
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
          data[k] = { value: src === 'name' ? String(doc.name || '') : (src === 'when' ? String(doc.when || '') : '') };
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
        if(/43101|refused|quota/i.test(msg)){ try{ await markFired(doc._id); }catch(e2){} }  // 无额度/拒收：标记防重试风暴
      }
    }
    return { ok: true, total, sent, skipped, failed };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
