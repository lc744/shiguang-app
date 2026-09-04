// 绸缪 v2 · 云函数 postApi —— 打卡分享核心
// 动作：publish（发布，含内容安全检测）/ feed（信息流分页）/ like（点赞切换）
//       mine（我的发布）/ del（删除+云存储清理）/ report（举报，阈值自动隐藏）/ get（详情）
// 内容安全：文字 security.msgSecCheck、图片 security.imgSecCheck（权限声明在 config.json）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const COL = 'posts';
const REP = 'reports';
const HIDE_THRESHOLD = 3;      // 举报数达到即自动隐藏
const MAX_PHOTOS = 3;

function nowMs(){ return Date.now(); }

// ---------- 内容安全 ----------
async function checkText(text){
  if(!text) return { ok: true };
  try{
    const r = await cloud.openapi.security.msgSecCheck({ content: String(text).slice(0, 2500) });
    const suggest = r && r.result && r.result.suggest;
    if(suggest && suggest !== 'pass') return { ok: false, why: '文字内容未通过安全检测（' + suggest + '）' };
    return { ok: true };
  }catch(e){
    if(e && e.errCode === 87014) return { ok: false, why: '文字包含违规内容' };
    return { ok: false, why: '安全检测服务不可用，请稍后再试' };   // 检测不可用时不放行（平台要求）
  }
}

async function checkImage(fileID){
  try{
    const dl = await cloud.downloadFile({ fileID });
    if(dl.fileContent.length > 1024 * 1024) return { ok: false, why: '图片过大，请压缩后重试' };
    const r = await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/jpeg', value: dl.fileContent }
    });
    if(r && r.errCode !== 0) return { ok: false, why: '图片未通过安全检测' };
    return { ok: true };
  }catch(e){
    if(e && e.errCode === 87014) return { ok: false, why: '图片包含违规内容' };
    return { ok: false, why: '图片检测服务不可用，请稍后再试' };
  }
}

// ---------- 动作 ----------
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if(!OPENID) return { ok: false, error: 'no openid' };
  const action = event && event.action;
  try{
    try{ await db.createCollection(COL); }catch(e){}
    try{ await db.createCollection(REP); }catch(e){}

    // ---- 发布 ----
    if(action === 'publish'){
      const p = event.post || {};
      const name = String(p.name || '').trim().slice(0, 30);
      const desc = String(p.desc || '').trim().slice(0, 500);
      const type = ['餐厅', '景点', '其他'].indexOf(p.type) >= 0 ? p.type : '其他';
      const photos = Array.isArray(p.photos) ? p.photos.slice(0, MAX_PHOTOS).filter(x => /^cloud:\/\//.test(x)) : [];
      const nickname = String(p.nickname || '路过的朋友').slice(0, 20);
      const avatarUrl = String(p.avatarUrl || '').slice(0, 300);
      if(!name) return { ok: false, error: '请填写名称' };
      if(!photos.length) return { ok: false, error: '至少上传一张照片' };

      const t = await checkText(name + ' ' + desc);
      if(!t.ok) return { ok: false, error: t.why };
      for(const f of photos){
        const c = await checkImage(f);
        if(!c.ok) return { ok: false, error: c.why };
      }

      await db.collection(COL).add({ data: {
        openid: OPENID, nickname, avatarUrl, type, name, desc, photos,
        likes: 0, likedBy: [], reports: 0, hidden: false, createdAt: nowMs()
      }});
      return { ok: true, op: 'publish' };
    }

    // ---- 信息流（分页）----
    if(action === 'feed'){
      const pageSize = 20;
      const page = Math.max(0, Math.min(50, parseInt(event.page, 10) || 0));
      const r = await db.collection(COL)
        .where({ hidden: false })
        .orderBy('createdAt', 'desc')
        .skip(page * pageSize).limit(pageSize)
        .field({ openid: false })
        .get();
      return { ok: true, list: r.data, page, hasMore: r.data.length === pageSize };
    }

    // ---- 详情 ----
    if(action === 'get'){
      const r = await db.collection(COL).doc(String(event.id || '')).get().catch(() => null);
      if(!r || !r.data || r.data.hidden) return { ok: false, error: '内容不存在' };
      const d = r.data; delete d.openid;
      return { ok: true, post: d };
    }

    // ---- 点赞切换 ----
    if(action === 'like'){
      const id = String(event.id || '');
      const r = await db.collection(COL).doc(id).get().catch(() => null);
      if(!r || !r.data || r.data.hidden) return { ok: false, error: '内容不存在' };
      const liked = (r.data.likedBy || []).indexOf(OPENID) >= 0;
      if(liked){
        await db.collection(COL).doc(id).update({ data: { likes: _.inc(-1), likedBy: _.pull(OPENID) } });
        return { ok: true, liked: false };
      }
      await db.collection(COL).doc(id).update({ data: { likes: _.inc(1), likedBy: _.push(OPENID) } });
      return { ok: true, liked: true };
    }

    // ---- 我的发布 ----
    if(action === 'mine'){
      const r = await db.collection(COL).where({ openid: OPENID }).orderBy('createdAt', 'desc').limit(50).get();
      return { ok: true, list: r.data };
    }

    // ---- 删除（仅本人，连带云存储文件）----
    if(action === 'del'){
      const id = String(event.id || '');
      const r = await db.collection(COL).where({ _id: id, openid: OPENID }).get();
      if(!r.data.length) return { ok: false, error: '只能删除自己的发布' };
      const ids = r.data[0].photos || [];
      if(ids.length){ await cloud.deleteFile({ fileList: ids }).catch(() => {}); }
      await db.collection(COL).where({ _id: id, openid: OPENID }).remove();
      return { ok: true, op: 'del' };
    }

    // ---- 举报（同人对同一内容一次；阈值自动隐藏）----
    if(action === 'report'){
      const id = String(event.id || '');
      const reason = String(event.reason || '').slice(0, 200);
      const seen = await db.collection(REP).where({ postId: id, openid: OPENID }).count();
      if(seen.total > 0) return { ok: true, op: 'report', already: true };
      await db.collection(REP).add({ data: { postId: id, openid: OPENID, reason, createdAt: nowMs() } });
      await db.collection(COL).doc(id).update({ data: { reports: _.inc(1) } });
      const after = await db.collection(COL).doc(id).get().catch(() => null);
      const n = after && after.data ? (after.data.reports || 0) : 0;
      if(n >= HIDE_THRESHOLD){
        await db.collection(COL).doc(id).update({ data: { hidden: true } });
        return { ok: true, op: 'report', hiddenNow: true };
      }
      return { ok: true, op: 'report' };
    }

    return { ok: false, error: 'unknown action' };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
