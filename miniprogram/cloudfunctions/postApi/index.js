// 绸缪 v2 · 云函数 postApi —— 打卡分享核心
// 动作：publish（发布，含内容安全检测）/ feed（信息流分页）/ like（点赞切换）
//       mine（我的发布）/ del（删除+云存储清理）/ report（举报，阈值自动隐藏）/ get（详情）
// 内容安全：文字 security.msgSecCheck、图片 security.imgSecCheck（权限声明在 config.json）
const cloud = require('wx-server-sdk');
const https = require('https');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const COL = 'posts';
const REP = 'reports';
const USR = 'users';
const CMT = 'comments';
const PLAN = 'plans';       // 攻略存档（对齐 App planSave/planList）

// ---- TCB PG 直签（跨端桥：读安卓端心跳用户等；密钥来自环境变量，未配置时相关功能自动降级） ----
const TCB_HOST = 'tcb.tencentcloudapi.com';
function pgEsc(s){ return String(s).replace(/'/g, "''"); }
function pgReady(){ return !!(process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY); }
function pgCall(action, payload){
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload || {});
  const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + TCB_HOST + '\nx-tc-action:' + action.toLowerCase() + '\n';
  const signedHeaders = 'content-type;host;x-tc-action';
  const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const hmacBuf = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
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
const HIDE_THRESHOLD = 3;      // 举报数达到即自动隐藏
const CMT_HIDE_THRESHOLD = 3;  // 评论举报隐藏阈值
const MAX_PHOTOS = 3;

function nowMs(){ return Date.now(); }

function fmtTimeStr(ms){
  const t = typeof ms === 'number' ? ms : (ms ? new Date(ms).getTime() : 0);
  if(!t) return '';
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

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
      const type = ['美食', '景点', '娱乐', '餐厅', '其他'].indexOf(p.type) >= 0 ? p.type : '其他';
      const city = String(p.city || '').trim().slice(0, 20);   // 城市名（攻略按城市聚合推荐）
      const addr = String(p.addr || '').trim().slice(0, 60);   // 具体位置（攻略行程引用）
      const photos = Array.isArray(p.photos) ? p.photos.slice(0, MAX_PHOTOS).filter(x => /^cloud:\/\//.test(x)) : [];
      const nickname = String(p.nickname || '路过的朋友').slice(0, 20);
      const avatarUrl = String(p.avatarUrl || '').slice(0, 300);
      // 对齐 App：名称与照片均选填（列表展示时回退 addr/类型），仅城市必填
      if(!city) return { ok: false, error: '请选择所在城市' };

      const t = await checkText(name + ' ' + desc);
      if(!t.ok) return { ok: false, error: t.why };
      for(const f of photos){
        const c = await checkImage(f);
        if(!c.ok) return { ok: false, error: c.why };
      }

      await db.collection(COL).add({ data: {
        openid: OPENID, nickname, avatarUrl, type, name, desc, photos, city, addr,
        likes: 0, likedBy: [], commentCount: 0, reports: 0, hidden: false, createdAt: nowMs()
      }});
      return { ok: true, op: 'publish' };
    }

    // ---- 信息流（分页）----
    if(action === 'feed'){
      const pageSize = 20;
      const page = Math.max(0, Math.min(50, parseInt(event.page, 10) || 0));
      const cond = { hidden: false };
      if(event.city) cond.city = String(event.city).slice(0, 20);
      if(event.type) cond.type = String(event.type).slice(0, 10);
      const r = await db.collection(COL)
        .where(cond)
        .orderBy('createdAt', 'desc')
        .skip(page * pageSize).limit(pageSize)
        .field({ openid: false })
        .get();
      let list = r.data;
      // 跨端桥：并入安卓端发布的帖子（PG posts 表），按时间归并（仅第一页，PG 侧最多取 100 条）
      if(page === 0 && pgReady() && !event.city){
        try{
          const pr = await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
            "SELECT p.id, p.uid, p.nickname, p.type, p.name, p.descr, p.photos, p.likes, p.reports, EXTRACT(EPOCH FROM p.created_at)::BIGINT AS ts, pr.avatar AS avatar FROM posts p LEFT JOIN profiles pr ON pr.uid = p.uid WHERE p.hidden = false ORDER BY p.created_at DESC LIMIT 100" });
          const appPosts = (pr && pr.Rows ? pr.Rows : []).map(line => {
            try{
              const a = Array.isArray(line) ? line : JSON.parse(line);
              let rawPhotos = [];
              try{ rawPhotos = a[6] ? JSON.parse(a[6]) : []; }catch(e2){ rawPhotos = []; }
              if(!Array.isArray(rawPhotos)) rawPhotos = [];
              // 安卓照片是 {t,f} 对象数组（t=缩略 f=原图，dataURL 或 URL）——列表用缩略图
              const photos = rawPhotos.map(p => (typeof p === 'string') ? p : String((p && (p.t || p.f)) || '')).filter(Boolean);
              // 列序: id(0) uid(1) nickname(2) type(3) name(4) descr(5) photos(6) likes(7) reports(8) ts(9) avatar(10)
              return { _id: 'app_' + String(a[0]), nickname: String(a[2] || '路过的朋友'), avatarUrl: String(a[10] || ''), type: String(a[3] || '其他'), name: String(a[4] || ''), desc: String(a[5] || ''), photos, likes: Number(a[7]) || 0, likedBy: [], commentCount: 0, reports: Number(a[8]) || 0, hidden: false, createdAt: (Number(a[9]) || 0) * 1000, authorUid: String(a[1] || ''), fromApp: true };
            }catch(e2){ return null; }
          }).filter(p => p && (!event.type || p.type === event.type));
          if(appPosts.length){
            const exist = new Set(list.map(p => p._id));
            list = list.concat(appPosts.filter(p => !exist.has(p._id)));
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            list = list.slice(0, pageSize);
          }
        }catch(e2){ /* PG 不可用：仅显示小程序端 */ }
      }
      return { ok: true, list, page, hasMore: r.data.length === pageSize };
    }

    // ---- 详情 ----
    if(action === 'get'){
      const gid = String(event.id || '');
      // 跨端桥：安卓发布的帖子（app_ 前缀）详情走 PG
      if(gid.startsWith('app_') && pgReady()){
        const pr = await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
          "SELECT p.id, p.uid, p.nickname, p.type, p.name, p.descr, p.photos, p.likes, p.reports, EXTRACT(EPOCH FROM p.created_at)::BIGINT AS ts, pr.avatar AS avatar FROM posts p LEFT JOIN profiles pr ON pr.uid = p.uid WHERE p.id = '" + pgEsc(gid.slice(4)) + "'" }).catch(() => null);
        const line = pr && pr.Rows && pr.Rows[0];
        if(!line) return { ok: false, error: '内容不存在' };
        const a = Array.isArray(line) ? line : JSON.parse(line);
        let rawPhotos = []; try{ rawPhotos = a[6] ? JSON.parse(a[6]) : []; }catch(e){ rawPhotos = []; }
        if(!Array.isArray(rawPhotos)) rawPhotos = [];
        // 详情用原图 f（无则退缩略图 t）
        const photos = rawPhotos.map(p => (typeof p === 'string') ? p : String((p && (p.f || p.t)) || '')).filter(Boolean);
        // 列序同 feed：id(0) uid(1) nickname(2) type(3) name(4) descr(5) photos(6) likes(7) reports(8) ts(9) avatar(10)
        return { ok: true, post: { _id: 'app_' + String(a[0]), nickname: String(a[2] || '路过的朋友'), avatarUrl: String(a[10] || ''), type: String(a[3] || '其他'), name: String(a[4] || ''), desc: String(a[5] || ''), photos, likes: Number(a[7]) || 0, likedBy: [], commentCount: 0, reports: Number(a[8]) || 0, hidden: false, createdAt: (Number(a[9]) || 0) * 1000, authorUid: String(a[1] || ''), fromApp: true } };
      }
      const r = await db.collection(COL).doc(String(event.id || '')).get().catch(() => null);
      if(!r || !r.data || r.data.hidden) return { ok: false, error: '内容不存在' };
      const d = r.data; delete d.openid;
      return { ok: true, post: d };
    }

    // ---- 点赞切换 ----
    if(action === 'like'){
      const id = String(event.id || '');
      // 跨端桥：安卓发布的帖子（app_ 前缀）点赞走 PG（一人一赞，可取消）
      if(id.startsWith('app_')){
        if(!pgReady()) return { ok: false, error: '跨端点赞暂不可用' };
        const pid = id.slice(4);
        const pr = await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
          "SELECT likes, liked_by FROM posts WHERE id = '" + pgEsc(pid) + "'" }).catch(() => null);
        const line = pr && pr.Rows && pr.Rows[0];
        if(!line) return { ok: false, error: '内容不存在' };
        const a = Array.isArray(line) ? line : JSON.parse(line);
        let likedBy = []; try{ likedBy = JSON.parse(String(a[1] || '[]')); }catch(e){ likedBy = []; }
        if(!Array.isArray(likedBy)) likedBy = [];
        const had = likedBy.indexOf(OPENID) >= 0;
        if(had){ likedBy = likedBy.filter(x => x !== OPENID); } else { likedBy.push(OPENID); }
        const newLikes = Math.max((Number(a[0]) || 0) + (had ? -1 : 1), 0);
        await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
          "UPDATE posts SET likes = " + newLikes + ", liked_by = '" + pgEsc(JSON.stringify(likedBy)) + "' WHERE id = '" + pgEsc(pid) + "'" });
        return { ok: true, liked: !had };
      }
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
      // 跨端桥：安卓帖子的举报走 PG reports 计数
      if(id.startsWith('app_') && pgReady()){
        await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
          "UPDATE posts SET reports = reports + 1 WHERE id = '" + pgEsc(id.slice(4)) + "'" });
        return { ok: true, op: 'report' };
      }
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

    // ---- 我的评论列表 ----
    if(action === 'myComments'){
      const r = await db.collection(CMT)
        .where({ openid: OPENID, hidden: false })
        .orderBy('createdAt', 'desc').limit(50)
        .get();
      // 批量取原帖信息（名称/类型/地址/隐藏态），对齐安卓 mc-item 条目结构
      const cmts = r.data;
      const pids = [...new Set(cmts.map(c => c.postId).filter(Boolean))];
      const pmap = {};
      for(const pid of pids){
        const h = await db.collection(COL).doc(pid).get().catch(() => null);
        if(h && h.data) pmap[pid] = { name: h.data.name || '', addr: h.data.addr || '', type: h.data.type || '', hidden: !!h.data.hidden };
      }
      return { ok: true, list: cmts.map(c => {
        const p = pmap[c.postId] || null;
        return { cid: c._id, postId: c.postId, content: c.content, createdAt: c.createdAt,
          pname: p ? p.name : '', paddr: p ? p.addr : '', ptype: p ? p.type : '', hidden: p ? p.hidden : true };
      }) };
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
      // 跨端桥：给安卓帖子评论 → 写 PG comments 表
      if(postId.startsWith('app_') && pgReady()){
        const cid = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
          "INSERT INTO comments (id, post_id, uid, nickname, content) VALUES ('" + pgEsc(cid) + "', '" + pgEsc(postId.slice(4)) + "', '" + pgEsc(OPENID) + "', '" + pgEsc(nickname) + "', '" + pgEsc(content) + "')" });
        return { ok: true, op: 'commentAdd' };
      }
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
      // 跨端桥：安卓帖子的评论在 PG comments 表（JOIN posts 判贴主）
      if(postId.startsWith('app_') && pgReady()){
        const pr = await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
          "SELECT c.id, c.uid, c.nickname, c.content, EXTRACT(EPOCH FROM c.created)::BIGINT AS ts, (c.uid = p.uid) AS owner FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.post_id = '" + pgEsc(postId.slice(4)) + "' ORDER BY c.created ASC LIMIT 100" }).catch(() => null);
        const list = (pr && pr.Rows ? pr.Rows : []).map(line => {
          try{
            const a = Array.isArray(line) ? line : JSON.parse(line);
            return { _id: 'appc_' + String(a[0]), postId, nickname: String(a[2] || '路过的朋友'), content: String(a[3] || ''), likes: 0, hidden: false, createdAt: (Number(a[4]) || 0) * 1000, self: String(a[1] || '') === OPENID, isOwner: a[5] === true };
          }catch(e){ return null; }
        }).filter(Boolean);
        return { ok: true, list };
      }
      // 文档库评论：查帖主 openid 标记贴主
      const headPost = await db.collection(COL).doc(postId).get().catch(() => null);
      const ownerOpenid = (headPost && headPost.data && headPost.data.openid) || '';
      const r = await db.collection(CMT)
        .where({ postId, hidden: false })
        .orderBy('createdAt', 'asc').limit(100)
        .field({ reportBy: false })
        .get();
      return { ok: true, list: r.data.map(c => ({ ...c, self: c.openid === OPENID, isOwner: ownerOpenid && c.openid === ownerOpenid })) };
    }

    // ---- 评论：删除（仅本人） ----
    if(action === 'commentDel'){
      const cid = String(event.cid || '');
      // 跨端桥：删除自己在安卓帖子下的评论（appc_ 前缀）走 PG
      if(cid.startsWith('appc_') && pgReady()){
        const pr = await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
          "DELETE FROM comments WHERE id = '" + pgEsc(cid.slice(5)) + "' AND uid = '" + pgEsc(OPENID) + "'" });
        if(pr && pr.Error) return { ok: false, error: '删除失败' };
        return { ok: true, op: 'commentDel' };
      }
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

    // ---- 攻略存档（对齐 App planSave/planList/planDel） ----
    if(action === 'planSave'){
      const city = String(event.city || '').slice(0, 20);
      const dateIso = String(event.dateIso || '').slice(0, 10);
      const items = Array.isArray(event.items) ? event.items.slice(0, 6).map(it => ({
        slot: String(it.slot || '').slice(0, 10),
        time: String(it.time || '').slice(0, 5),
        emoji: String(it.emoji || '📍').slice(0, 4),
        name: String(it.name || '').slice(0, 30),
        addr: String(it.addr || '').slice(0, 50)
      })) : [];
      if(!city || !items.length) return { ok: false, error: '攻略内容为空' };
      // 防重复：同城市同日期同首站已存过则不重复入库
      const dup = await db.collection(PLAN).where({ openid: OPENID, city, dateIso, 'items.0.name': items[0].name }).count();
      if(dup.total > 0) return { ok: true, op: 'planSave', already: true };
      await db.collection(PLAN).add({ data: { openid: OPENID, city, dateIso, items, createdAt: nowMs() } });
      return { ok: true, op: 'planSave' };
    }
    if(action === 'planList'){
      const r = await db.collection(PLAN).where({ openid: OPENID }).orderBy('createdAt', 'desc').limit(30).get();
      return { ok: true, list: r.data.map(p => ({ id: p._id, city: p.city, dateIso: p.dateIso, items: p.items, createdAt: p.createdAt })) };
    }
    if(action === 'planDel'){
      const id = String(event.id || '');
      const doc = await db.collection(PLAN).where({ _id: id, openid: OPENID }).count();
      if(!doc.total) return { ok: false, error: '无此攻略' };
      await db.collection(PLAN).doc(id).remove();
      return { ok: true };
    }

    // ---- 管理端（users 集合 admin: true 的用户；判定/待审列表/处理，对齐 App 管理面板） ----
    async function isAdmin(){
      const u = await db.collection(USR).where({ openid: OPENID }).limit(1).get();
      return !!(u.data.length && u.data[0].admin);
    }
    // 口令自授（替代控制台手动设 admin:true）：部署后在小程序"我的"页长按"设置"输入口令即可
    const ADMIN_PASS = 'choumou2026';
    if(action === 'adminGrant'){
      if(String(event.pass || '') !== ADMIN_PASS) return { ok: false, error: '口令不对' };
      const u = await db.collection(USR).where({ openid: OPENID }).get();
      if(u.data.length){
        await db.collection(USR).where({ openid: OPENID }).update({ data: { admin: true } });
      } else {
        await db.collection(USR).add({ data: { openid: OPENID, nickname: '', avatarUrl: '', admin: true, updatedAt: nowMs() } });
      }
      return { ok: true, admin: true };
    }
    if(action === 'adminCheck'){
      return { ok: true, admin: await isAdmin() };
    }
    if(action === 'adminList'){
      if(!(await isAdmin())) return { ok: false, error: '无管理权限' };
      const posts = await db.collection(COL).where({ hidden: true }).orderBy('createdAt', 'desc').limit(50).get();
      const cmts = await db.collection(CMT).where({ hidden: true }).orderBy('createdAt', 'desc').limit(50).get();
      // 用户在线状态（对齐安卓管理面板：🟢在线5分钟内 / 🟡最近30分钟内 / ⚪离线）
      // 跨端桥：安卓心跳在 PG users 表（uid 归属），直签读取并与小程序端按身份归并
      let users = [];
      const diag = { envReady: !!(process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY), pgError: '', pgRows: 0, merged: 0 };
      try{
        const ur = await db.collection(USR).limit(100).get();
        const byKey = {};
        const wxUidOf = (openid) => { const c = require('crypto'); return 'wx_' + c.createHash('sha256').update('choumou-wx:' + openid).digest('hex').slice(0, 24); };
        ur.data.forEach(u => {
          const rec = { nickname: u.nickname || '', tail: String(u.openid || '').slice(-6), agoSec: u.lastActive ? Math.max(0, Math.floor((Date.now() - u.lastActive) / 1000)) : -1, key: u._openid ? wxUidOf(u._openid) : ('doc_' + String(u._openid || '')), src: 'doc' };
          const ex = byKey[rec.key];
          if(!ex) byKey[rec.key] = rec;
          else { ex.agoSec = Math.min(ex.agoSec < 0 ? Infinity : ex.agoSec, rec.agoSec < 0 ? Infinity : rec.agoSec); if(!ex.nickname && rec.nickname) ex.nickname = rec.nickname; if(ex.src !== rec.src) ex.both = true; }
        });
        // PG 桥：读安卓端心跳用户（last_seen 90 天内），uid 与 wxUid(openid) 相同即同一人归并
        if(process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY){
          try{
            const r = await pgCall('ExecutePGSql', { EnvId: 'gerenceshi-d0gguq5u39b4b86b2', Sql:
              "SELECT uid, nickname, EXTRACT(EPOCH FROM (now() - last_seen))::BIGINT AS ago FROM users WHERE last_seen IS NOT NULL AND last_seen > now() - interval '90 days' ORDER BY last_seen DESC LIMIT 200" });
            (r && r.Rows ? r.Rows : []).forEach(line => {
              // ExecutePGSql 的 Rows 每行已是值数组 [uid, nickname, ago]（外层 JSON.parse 时已解析）
              const arr = Array.isArray(line) ? line : JSON.parse(line);
              if(!Array.isArray(arr) || arr.length < 3) return;
              const rec = { nickname: String(arr[1] || ''), tail: String(arr[0] || '').slice(-6), agoSec: Number(arr[2]) || 0, key: String(arr[0] || ''), src: 'pg' };
              const ex = byKey[rec.key];
              if(!ex) byKey[rec.key] = rec;
              else { ex.agoSec = Math.min(ex.agoSec < 0 ? Infinity : ex.agoSec, rec.agoSec); if(!ex.nickname && rec.nickname) ex.nickname = rec.nickname; if(ex.src !== rec.src) ex.both = true; }
            });
            diag.pgRows = (r && r.Rows ? r.Rows.length : 0);
          }catch(e2){ diag.pgError = String(e2 && e2.message || e2).slice(0, 120); }
        }
        users = Object.keys(byKey).map(k => {
          const r = byKey[k];
          const out = { nickname: r.nickname, tail: r.tail, agoSec: r.agoSec < 0 ? -1 : r.agoSec };
          if(r.both) out.both = true;
          return out;
        });
        // 在线/最近的排前，从未活跃垫底
        users.sort((a, b) => ((a.agoSec < 0 ? 1 : 0) - (b.agoSec < 0 ? 1 : 0)) || (a.agoSec - b.agoSec));
        diag.merged = users.filter(u => u.both).length;
      }catch(e){}
      return { ok: true, diag, users,
               posts: posts.data.map(p => ({ id: p._id, type: p.type, name: p.name || p.addr || '（未命名）', nickname: p.nickname, reports: p.reports || 0, photos: p.photos || [], time: fmtTimeStr(p.createdAt) })),
               comments: cmts.data.map(c => ({ cid: c._id, content: c.content, nickname: c.nickname, reports: c.reports || 0, time: fmtTimeStr(c.createdAt) })) };
    }
    // ---- 逆地理（高德 regeo 代理，Key 与安卓 App 同一 Web 服务 Key）----
    // 用途：发布页地图选点后由经纬度反查省市区，自动回填所在城市。
    // wx.chooseLocation 返回 GCJ-02 坐标，与高德坐标系一致，无需转换。
    if(action === 'regeo'){
      const lat = Number(event.lat), lng = Number(event.lng);
      if(!isFinite(lat) || !isFinite(lng)) return { ok: false, error: '参数错误' };
      const AMAP_KEY = '6c6551e4b4386aa115db5bc121003d7c';
      const j = await new Promise((resolve, reject) => {
        const req = https.get('https://restapi.amap.com/v3/geocode/regeo?key=' + AMAP_KEY + '&location=' + lng.toFixed(6) + ',' + lat.toFixed(6), res => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => { try{ resolve(JSON.parse(d)); }catch(e){ reject(e); } });
        });
        req.on('error', reject);
        req.setTimeout(9000, () => { req.destroy(new Error('regeo timeout')); });
      }).catch(() => null);
      const comp = j && j.regeocode && j.regeocode.addressComponent || null;
      if(!comp) return { ok: false, error: '位置识别失败' };
      const pick = v => (Array.isArray(v) ? '' : String(v || ''));
      const province = pick(comp.province);
      const city = pick(comp.city) || province;   // 直辖市 city 字段为空数组
      return { ok: true, province, city, district: pick(comp.district) };
    }

    // ---- 心跳（用户在线状态数据源，对齐安卓 CloudAuth heartbeat） ----
    if(action === 'heartbeat'){
      const nickname = String(event.nickname || '').slice(0, 20);
      try{
        const r = await db.collection(USR).where({ openid: OPENID }).get();
        if(r.data && r.data.length){
          await db.collection(USR).doc(r.data[0]._id).update({ data: { lastActive: Date.now(), nickname: nickname || (r.data[0].nickname || '') } });
        } else {
          await db.collection(USR).add({ data: { openid: OPENID, nickname: nickname, lastActive: Date.now(), admin: false } });
        }
      }catch(e){}
      return { ok: true };
    }
    if(action === 'adminPostAction'){
      if(!(await isAdmin())) return { ok: false, error: '无管理权限' };
      const id = String(event.id || '');
      const act = String(event.act || '');
      if(act === 'restore'){
        await db.collection(COL).doc(id).update({ data: { hidden: false, reports: 0 } });
        return { ok: true };
      }
      if(act === 'delete'){
        const doc = await db.collection(COL).doc(id).get().catch(() => null);
        const fileIDs = ((doc && doc.data && doc.data.photos) || []).filter(x => /^cloud:\/\//.test(String(x)));
        if(fileIDs.length){ try{ await cloud.deleteFile({ fileList: fileIDs }); }catch(e){} }
        await db.collection(COL).doc(id).remove();
        return { ok: true };
      }
      return { ok: false, error: '未知操作' };
    }
    if(action === 'adminCommentAction'){
      if(!(await isAdmin())) return { ok: false, error: '无管理权限' };
      const cid = String(event.cid || '');
      const act = String(event.act || '');
      if(act === 'restore'){
        await db.collection(CMT).doc(cid).update({ data: { hidden: false, reports: 0 } });
        return { ok: true };
      }
      if(act === 'delete'){
        const doc = await db.collection(CMT).doc(cid).get().catch(() => null);
        const postId = doc && doc.data && doc.data.postId;
        await db.collection(CMT).doc(cid).remove();
        if(postId){ await db.collection(COL).doc(postId).update({ data: { commentCount: _.inc(-1) } }).catch(() => {}); }
        return { ok: true };
      }
      return { ok: false, error: '未知操作' };
    }

    return { ok: false, error: 'unknown action' };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
