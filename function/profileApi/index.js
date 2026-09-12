// 绸缪 · profileApi 云函数（零依赖版：内置 crypto 直签腾讯云 API，环境内 PG 存头像）
// 部署：@cloudbase/manager-node，需环境变量 TCB_SECRET_ID / TCB_SECRET_KEY
// 职责：服务端验证认证网关 Bearer token → 在 profiles 表读写头像
const https = require('https');
const crypto = require('crypto');

const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
const REGION = 'ap-shanghai';
const HOST = 'tcb.tencentcloudapi.com';
const API_VER = '2018-06-08';

function sha256hex(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function hmacBuf(key, s){ return crypto.createHmac('sha256', key).update(s).digest(); }

// TC3-HMAC-SHA256 直签（JSON 载荷）
function callApi(action, payload){
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload || {});
    const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + HOST + '\nx-tc-action:' + action.toLowerCase() + '\n';
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = 'POST' + '\n' + '/' + '\n' + '' + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + sha256hex(body);
    const stringToSign = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/tcb/tc3_request\n' + sha256hex(canonicalRequest);
    const kDate = hmacBuf('TC3' + process.env.TCB_SECRET_KEY, date);
    const kService = hmacBuf(kDate, 'tcb');
    const kSigning = hmacBuf(kService, 'tc3_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const auth = 'TC3-HMAC-SHA256 Credential=' + process.env.TCB_SECRET_ID + '/' + date + '/tcb/tc3_request, SignedHeaders=' + signedHeaders + ', Signature=' + signature;
    const req = https.request({
      hostname: HOST, path: '/', method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': HOST,
        'X-TC-Action': action,
        'X-TC-Region': REGION,
        'X-TC-Timestamp': String(ts),
        'X-TC-Version': API_VER,
        'Authorization': auth,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try{
          const j = JSON.parse(d);
          if(j.Response && j.Response.Error) return reject(new Error(j.Response.Error.Code + ' ' + j.Response.Error.Message));
          resolve(j.Response || {});
        }catch(e){ reject(new Error('响应解析失败: ' + d.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API超时')); });
    req.write(body);
    req.end();
  });
}

function esc(s){ return String(s).replace(/'/g, "''"); }

function verifyToken(token){
  return new Promise((resolve) => {
    const req = https.request({
      hostname: ENV + '.api.tcloudbasegateway.com',
      path: '/auth/v1/user/me?client_id=' + ENV,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      timeout: 8000,
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try{
          const j = JSON.parse(d);
          resolve((res.statusCode === 200 && j && j.sub) ? j.sub : null);
        }catch(e){ resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function json(code, obj){
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    },
    body: JSON.stringify(obj),
  };
}

exports.main = async (event) => {
  try{
    const method = String(event.httpMethod || 'POST').toUpperCase();
    if(method === 'OPTIONS') return json(200, { ok: true });
    if(!process.env.TCB_SECRET_ID || !process.env.TCB_SECRET_KEY) return json(500, { error: '函数未配置数据库凭据' });
    let body = {};
    try{ body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); }catch(e){}
    const hdr = event.headers || {};
    const authz = hdr.authorization || hdr.Authorization || body.token || '';
    const token = String(authz).replace(/^Bearer\s+/i, '').trim();
    const action = body.action || 'get';

    // 匿名可读动作（公共信息流 / 取全图）：无 token 也可用
    const ANON_ACTIONS = ['feed', 'photo'];
    let uid = null;
    if(ANON_ACTIONS.indexOf(action) >= 0 && !token){
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, uid TEXT, nickname TEXT, type TEXT, name TEXT, descr TEXT, photos TEXT, likes INT DEFAULT 0, liked_by TEXT DEFAULT '[]', reports INT DEFAULT 0, report_by TEXT DEFAULT '[]', hidden BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS addr TEXT" });
      return await handlePostAction(action, body, null);
    }

    if(!token) return json(401, { error: '缺少登录凭据' });
    uid = await verifyToken(token);
    if(!uid) return json(401, { error: '登录状态无效或已过期' });

    // 自愈建表
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS profiles (uid TEXT PRIMARY KEY, avatar TEXT, updated_at TIMESTAMPTZ DEFAULT now())" });
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, uid TEXT, nickname TEXT, type TEXT, name TEXT, descr TEXT, photos TEXT, likes INT DEFAULT 0, liked_by TEXT DEFAULT '[]', reports INT DEFAULT 0, report_by TEXT DEFAULT '[]', hidden BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())" });
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS addr TEXT" });

    // 分享相关动作（uid 已验证）
    const POST_ACTIONS = ['publish', 'feed', 'mine', 'like', 'del', 'report', 'photo'];
    if(POST_ACTIONS.indexOf(action) >= 0) return await handlePostAction(action, body, uid);
    if(action === 'mediaPut'){
      // 全图分片上传：每请求 ≤ ~85KB，集齐 total 片后组装入库
      const mid = String((body || {}).mid || '').slice(0, 48);
      const idx = Math.max(0, Math.min(15, parseInt((body || {}).i, 10) || 0));
      const total = Math.max(1, Math.min(16, parseInt((body || {}).n, 10) || 1));
      const chunk = (typeof (body || {}).c === 'string') ? body.c.slice(0, 90000) : '';
      if(!mid || !chunk) return json(400, { ok: false, error: '参数缺失' });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS media_chunks (mid TEXT, idx INT, data TEXT, PRIMARY KEY(mid, idx))" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO media_chunks (mid, idx, data) VALUES ('" + esc(mid) + "', " + idx + ", '" + esc(chunk) + "') ON CONFLICT (mid, idx) DO UPDATE SET data = EXCLUDED.data" });
      const rc = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT idx, data FROM media_chunks WHERE mid = '" + esc(mid) + "'" });
      const rows = ((rc && rc.Rows) || []).map(x => JSON.parse(x));
      if(rows.length < total) return json(200, { ok: true, mid, assembled: false, have: rows.length, total });
      rows.sort((a, b) => a[0] - b[0]);
      const data = 'data:image/jpeg;base64,' + rows.map(x => x[1]).join('');
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS media (mid TEXT PRIMARY KEY, owner TEXT, data TEXT, created TIMESTAMPTZ DEFAULT now())" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO media (mid, owner, data) VALUES ('" + esc(mid) + "', '" + esc(uid) + "', '" + esc(data) + "') ON CONFLICT (mid) DO UPDATE SET data = EXCLUDED.data, created = now()" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM media_chunks WHERE mid = '" + esc(mid) + "'" });
      return json(200, { ok: true, mid, assembled: true });
    }
    if(action === 'get'){
      const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT avatar FROM profiles WHERE uid = '" + esc(uid) + "'" });
      let avatar = null;
      if(r && r.Rows && r.Rows.length){
        try{ const row = JSON.parse(r.Rows[0]); avatar = row[0] || null; }catch(e){}
      }
      return json(200, { uid, profile: avatar ? { avatar } : null });
    }
    if(action === 'save'){
      const p = body.profile || {};
      const avatar = (typeof p.avatar === 'string') ? p.avatar.slice(0, 400000) : null;
      if(avatar === null) return json(200, { ok: true, uid, note: '无头像字段' });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO profiles (uid, avatar, updated_at) VALUES ('" + esc(uid) + "', '" + esc(avatar) + "', now()) ON CONFLICT (uid) DO UPDATE SET avatar = EXCLUDED.avatar, updated_at = now()" });
      return json(200, { ok: true, uid });
    }
    return json(400, { error: '未知操作: ' + String(action).slice(0, 40) });
  }catch(e){
    return json(500, { error: String((e && e.message) || e).slice(0, 200) });
  }
};

// ---------------- 分享（posts 表） ----------------
const HIDE_THRESHOLD = 3;
const MAX_PHOTOS = 3;

function pgBool(v){ return v === true || v === 'true'; }

function rowToPost(row, meUid){
  // row = [id, uid, nickname, type, name, addr, descr, photos, likes, liked_by, hidden, created_at, avatar]
  let photos = [];
  try{ photos = (JSON.parse(row[7]) || []).map(x => (x && typeof x === 'object') ? x.t : x).filter(Boolean); }catch(e){}
  let likedBy = [];
  try{ likedBy = JSON.parse(row[9]) || []; }catch(e){}
  const created = row[11] ? String(row[11]).replace('T', ' ').slice(0, 16) : '';
  return {
    id: row[0], uid: row[1], nickname: row[2], type: row[3], name: row[4] || '',
    addr: row[5] || '', desc: row[6] || '', photos, likes: Number(row[8]) || 0,
    selfLiked: meUid ? (likedBy.indexOf(meUid) >= 0) : false,
    hidden: pgBool(row[10]), createdAt: created,
    avatar: row[12] || null,
  };
}

async function handlePostAction(action, body, uid){
  // ---- 发布 ----
  if(action === 'publish'){
    const p = body.post || {};
    const name = String(p.name || '').trim().slice(0, 30);
    const addr = String(p.addr || '').trim().slice(0, 80);
    const desc = String(p.desc || '').trim().slice(0, 500);
    const type = ['美食', '景点', '娱乐'].indexOf(p.type) >= 0 ? p.type : '娱乐';
    const nickname = String(p.nickname || '路过的朋友').slice(0, 20);
    let photos = Array.isArray(p.photos) ? p.photos.slice(0, MAX_PHOTOS) : [];
    photos = photos.map(x => (typeof x === 'string') ? { t: x, f: x } : x).filter(x => x && typeof x.t === 'string');
    if(!addr) return json(400, { ok: false, error: '请填写地址' });
    for(const ph of photos){
      if(typeof ph.f === 'string') ph.f = ph.f.slice(0, 400000);
      if(typeof ph.t === 'string') ph.t = ph.t.slice(0, 60000);
    }
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await callApi('ExecutePGSql', { EnvId: ENV, Sql:
      "INSERT INTO posts (id, uid, nickname, type, name, addr, descr, photos, created_at) VALUES ('" +
      esc(id) + "', '" + esc(uid) + "', '" + esc(nickname) + "', '" + esc(type) + "', '" + esc(name) + "', '" + esc(addr) + "', '" + esc(desc) + "', '" +
      esc(JSON.stringify(photos)) + "', now())" });
    // 头像自愈：发布时顺带补写/更新资料头像，保证信息流联表能取到
    const avatar = (typeof p.avatar === 'string' && p.avatar.indexOf('data:image/') === 0) ? p.avatar.slice(0, 400000) : null;
    if(avatar){
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO profiles (uid, avatar, updated_at) VALUES ('" + esc(uid) + "', '" + esc(avatar) + "', now()) ON CONFLICT (uid) DO UPDATE SET avatar = EXCLUDED.avatar, updated_at = now()" });
    }
    return json(200, { ok: true, id });
  }

  // ---- 信息流（分页，仅未隐藏，联表取头像） ----
  if(action === 'feed'){
    const page = Math.max(0, Math.min(50, parseInt(body.page, 10) || 0));
    const pageSize = 10;
    // 筛选：城市（地址包含匹配，精确到市）+ 类型（美食/景点/娱乐）
    const city = String(body.city || '').trim().slice(0, 24);
    const type = ['美食', '景点', '娱乐'].indexOf(body.type) >= 0 ? body.type : '';
    let where = 'p.hidden = false';
    if(city) where += " AND p.addr LIKE '%" + esc(city) + "%'";
    if(type) where += " AND p.type = '" + type + "'";
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql:
      "SELECT p.id, p.uid, p.nickname, p.type, p.name, p.addr, p.descr, p.photos, p.likes, p.liked_by, p.hidden, to_char(p.created_at, 'YYYY-MM-DD HH24:MI'), pr.avatar FROM posts p LEFT JOIN profiles pr ON pr.uid = p.uid WHERE " + where + " ORDER BY p.created_at DESC LIMIT " + pageSize + " OFFSET " + (page * pageSize) });
    const list = (r && r.Rows ? r.Rows : []).map(line => { try{ return JSON.parse(line); }catch(e){ return null; } }).filter(Boolean).map(row => rowToPost(row, uid));
    return json(200, { ok: true, list, page, hasMore: list.length === pageSize });
  }

  // ---- 我的发布 ----
  if(action === 'mine'){
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql:
      "SELECT p.id, p.uid, p.nickname, p.type, p.name, p.addr, p.descr, p.photos, p.likes, p.liked_by, p.hidden, to_char(p.created_at, 'YYYY-MM-DD HH24:MI'), pr.avatar FROM posts p LEFT JOIN profiles pr ON pr.uid = p.uid WHERE p.uid = '" + esc(uid) + "' AND p.hidden = false ORDER BY p.created_at DESC LIMIT 50" });
    const list = (r && r.Rows ? r.Rows : []).map(line => { try{ return JSON.parse(line); }catch(e){ return null; } }).filter(Boolean).map(row => rowToPost(row, uid));
    return json(200, { ok: true, list });
  }

  // ---- 点赞切换 ----
  if(action === 'like'){
    const id = String(body.id || '').slice(0, 40);
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT liked_by, hidden FROM posts WHERE id = '" + esc(id) + "'" });
    if(!r || !r.Rows || !r.Rows.length) return json(404, { ok: false, error: '内容不存在' });
    let likedBy = [];
    let hidden = false;
    try{ const row = JSON.parse(r.Rows[0]); likedBy = JSON.parse(row[0] || '[]') || []; hidden = pgBool(row[1]); }catch(e){}
    if(hidden) return json(404, { ok: false, error: '内容不存在' });
    const liked = likedBy.indexOf(uid) >= 0;
    if(liked) likedBy = likedBy.filter(x => x !== uid); else likedBy.push(uid);
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "UPDATE posts SET likes = GREATEST(0, likes + " + (liked ? -1 : 1) + "), liked_by = '" + esc(JSON.stringify(likedBy)) + "' WHERE id = '" + esc(id) + "'" });
    return json(200, { ok: true, liked: !liked });
  }

  // ---- 删除（仅本人） ----
  if(action === 'del'){
    const id = String(body.id || '').slice(0, 40);
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM posts WHERE id = '" + esc(id) + "' AND uid = '" + esc(uid) + "'" });
    const affected = r && r.AffectedRows ? Number(r.AffectedRows) : 0;
    if(!affected) return json(403, { ok: false, error: '只能删除自己的发布' });
    return json(200, { ok: true });
  }

  // ---- 举报（同一用户一次；阈值自动隐藏） ----
  if(action === 'report'){
    const id = String(body.id || '').slice(0, 40);
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT report_by, hidden FROM posts WHERE id = '" + esc(id) + "'" });
    if(!r || !r.Rows || !r.Rows.length) return json(404, { ok: false, error: '内容不存在' });
    let reportBy = [];
    let hidden = false;
    try{ const row = JSON.parse(r.Rows[0]); reportBy = JSON.parse(row[0] || '[]') || []; hidden = pgBool(row[1]); }catch(e){}
    if(hidden) return json(404, { ok: false, error: '内容不存在' });
    if(reportBy.indexOf(uid) >= 0) return json(200, { ok: true, already: true });
    reportBy.push(uid);
    const reports = reportBy.length;
    const hideNow = reports >= HIDE_THRESHOLD;
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "UPDATE posts SET reports = " + reports + ", report_by = '" + esc(JSON.stringify(reportBy)) + "'" + (hideNow ? ", hidden = true" : "") + " WHERE id = '" + esc(id) + "'" });
    return json(200, { ok: true, hiddenNow: !!hideNow });
  }

  // ---- 取全图（匿名可读） ----
  if(action === 'photo'){
    const id = String(body.id || '').slice(0, 40);
    const idx = Math.max(0, Math.min(MAX_PHOTOS - 1, parseInt(body.i, 10) || 0));
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT photos FROM posts WHERE id = '" + esc(id) + "' AND hidden = false" });
    if(!r || !r.Rows || !r.Rows.length) return json(404, { ok: false, error: '内容不存在' });
    let photos = [];
    try{ photos = JSON.parse(JSON.parse(r.Rows[0])[0]) || []; }catch(e){}
    const ph = photos[idx];
    const url = ph && typeof ph === 'object' ? ph.f : ph;
    if(url && String(url).indexOf('@m:') === 0){
      const mid = String(url).slice(3);
      const mr = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT data FROM media WHERE mid = '" + esc(mid) + "'" });
      if(mr && mr.Rows && mr.Rows.length){
        let data = ''; try{ data = JSON.parse(mr.Rows[0])[0] || ''; }catch(e){}
        return json(200, { ok: true, url: data });
      }
      return json(404, { ok: false, error: '图片不存在' });
    }
    return json(200, { ok: true, url: url || null });
  }

  return json(400, { ok: false, error: '未知操作' });
}
