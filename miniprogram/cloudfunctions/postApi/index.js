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
const USR = 'users';
const CMT = 'comments';
const HIDE_THRESHOLD = 3;      // 举报数达到即自动隐藏
const CMT_HIDE_THRESHOLD = 3;  // 评论举报隐藏阈值
const MAX_PHOTOS = 3;

function nowMs(){ return Date.now(); }

// ---------- 评论侧敏感词（对齐 App 双轨审核第一道） ----------
const BAD_WORDS = ['加微信','加V','加Q','赌博','博彩','下注','代开发票','色情','约炮','刷单','点赞返现','兼职日结','高利贷','办证','外挂','代练','转账返','资金盘','裸聊','枪支','援交','一夜情','包养','代孕','卖淫','嫖娼','毒品','冰毒','迷药','自残','跑分','洗钱','砍头息','网贷','征信修复','养卡','时时彩','百家乐','刷粉','刷量','僵尸粉','加weixin','君羊'];
function normalizeText(s){
  let t = String(s || '');
  t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');
  t = t.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  t = t.replace(/[·•|!！,，。.\s*#＃^～~_\-]/g, '');
  t = t.replace(/微|威|薇|危/g, 'V').replace(/[qＱ]/gi, 'Q');
  t = t.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '');
  return t;
}
function hasBadWord(s){
  const t = String(s || '');
  const n = normalizeText(t);
  for(const w of BAD_WORDS){
    const wn = normalizeText(w);
    if(t.indexOf(w) >= 0) return true;
    if(wn && wn.length >= 2 && n.indexOf(wn) >= 0) return true;
  }
  if(/君羊|條|艹|莪|迩|仩/.test(t)) return true;
  return false;
}
// 评论频率限制：查 60 秒内该用户已发评论数（DB 实现，跨实例准确）
async function rateOk(openid){
  const since = nowMs() - 60000;
  const r = await db.collection(CMT).where({ openid, createdAt: _.gt(since) }).count();
  return r.total < 3;
}

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
    try{ await db.createCollection(USR); }catch(e){}
    try{ await db.createCollection(CMT); }catch(e){}

    // ---- 个人信息：保存 / 读取 ----
    if(action === 'profile'){
      if(event.mode === 'save'){
        const nickname = String((event.profile && event.profile.nickname) || '').trim().slice(0, 20) || '路过的朋友';
        const avatarUrl = String((event.profile && event.profile.avatarUrl) || '').slice(0, 300);
        const found = await db.collection(USR).where({ openid: OPENID }).get();
        if(found.data.length){
          await db.collection(USR).where({ openid: OPENID }).update({ data: { nickname, avatarUrl, updatedAt: nowMs() } });
        }else{
          await db.collection(USR).add({ data: { openid: OPENID, nickname, avatarUrl, createdAt: nowMs(), updatedAt: nowMs() } });
        }
        return { ok: true, op: 'profileSave' };
      }
      // mode get
      const g = await db.collection(USR).where({ openid: OPENID }).get();
      if(!g.data.length) return { ok: true, profile: null };
      const d = g.data[0]; delete d._id; delete d.openid;
      return { ok: true, profile: d };
    }

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
        likes: 0, likedBy: [], commentCount: 0, reports: 0, hidden: false, createdAt: nowMs()
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

    // ---- 评论：发表（词库 + msgSecCheck + 频率限制） ----
    if(action === 'commentAdd'){
      const postId = String(event.id || '');
      const content = String(event.content || '').trim().slice(0, 200);
      const nickname = String(event.nickname || '路过的朋友').slice(0, 20);
      if(!postId || !content) return { ok: false, error: '评论内容不能为空' };
      if(hasBadWord(content)) return { ok: false, error: '评论含违规内容，请修改后再发' };
      if(hasBadWord(nickname)) return { ok: false, error: '昵称含违规内容，请修改后再发' };
      if(!(await rateOk(OPENID))) return { ok: false, error: '发送太频繁，请稍后再试' };
      const head = await db.collection(COL).doc(postId).get().catch(() => null);
      if(!head || !head.data || head.data.hidden) return { ok: false, error: '内容不存在' };
      const sec = await checkText(content);
      if(!sec.ok) return { ok: false, error: sec.why };
      await db.collection(CMT).add({ data: {
        postId, openid: OPENID, nickname, content,
        reports: 0, reportBy: [], hidden: false, createdAt: nowMs()
      }});
      await db.collection(COL).doc(postId).update({ data: { commentCount: _.inc(1) } });
      return { ok: true, op: 'commentAdd' };
    }

    // ---- 评论：列表（仅未隐藏，正序） ----
    if(action === 'commentList'){
      const postId = String(event.id || '');
      if(!postId) return { ok: false, error: '参数缺失' };
      const r = await db.collection(CMT)
        .where({ postId, hidden: false })
        .orderBy('createdAt', 'asc').limit(100)
        .field({ reportBy: false })
        .get();
      return { ok: true, list: r.data.map(c => ({ ...c, self: c.openid === OPENID })) };
    }

    // ---- 评论：删除（仅本人） ----
    if(action === 'commentDel'){
      const cid = String(event.cid || '');
      const r = await db.collection(CMT).where({ _id: cid, openid: OPENID }).get();
      if(!r.data.length) return { ok: false, error: '只能删除自己的评论' };
      const postId = r.data[0].postId;
      await db.collection(CMT).where({ _id: cid, openid: OPENID }).remove();
      await db.collection(COL).doc(postId).update({ data: { commentCount: _.inc(-1) } }).catch(() => {});
      return { ok: true, op: 'commentDel' };
    }

    // ---- 评论：举报（同人一次，阈值自动隐藏） ----
    if(action === 'commentReport'){
      const cid = String(event.cid || '');
      const seen = await db.collection(REP).where({ commentId: cid, openid: OPENID }).count();
      if(seen.total > 0) return { ok: true, op: 'commentReport', already: true };
      await db.collection(REP).add({ data: { commentId: cid, openid: OPENID, createdAt: nowMs() } });
      await db.collection(CMT).doc(cid).update({ data: { reports: _.inc(1) } });
      const after = await db.collection(CMT).doc(cid).get().catch(() => null);
      const n = after && after.data ? (after.data.reports || 0) : 0;
      if(n >= CMT_HIDE_THRESHOLD){
        await db.collection(CMT).doc(cid).update({ data: { hidden: true } });
        return { ok: true, op: 'commentReport', hiddenNow: true };
      }
      return { ok: true, op: 'commentReport' };
    }

    return { ok: false, error: 'unknown action' };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
