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

// 小程序直登凭据（deploy_tcb_fn.js 注入；缺省时 wxLogin 返回未配置）
const WX_APPID = process.env.WX_APPID || '';
const WX_APPSECRET = process.env.WX_APPSECRET || '';
function httpsGetJson(host, path){
  return new Promise(resolve => {
    try{
      const req = https.get({ host, path, timeout: 8000 }, res => {
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => { try{ resolve(JSON.parse(d)); }catch(e){ resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    }catch(e){ resolve(null); }
  });
}

// ---- 微信登录（双轨自签会话）----
// 密钥：环境变量 WX_JWT_SECRET（由 deploy_tcb_fn.js 注入）；缺省时微信登录自动禁用
const WX_SECRET = process.env.WX_JWT_SECRET || '';
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function wxUid(openid){ return 'wx_' + sha256hex('choumou-wx:' + openid).slice(0, 24); }
function wxSign(payload){
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', WX_SECRET).update(body).digest());
  return 'wx.' + body + '.' + sig;
}
function wxVerify(token){
  // 返回 payload 或 null；格式 wx.<b64json>.<b64sig>
  try{
    if(!token.startsWith('wx.')) return null;
    const parts = token.split('.');
    if(parts.length !== 3) return null;
    const body = parts[1], sig = parts[2];
    const expect = b64url(crypto.createHmac('sha256', WX_SECRET).update(body).digest());
    if(sig !== expect) return null;
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if(!payload || !payload.sub || (payload.exp && Date.now() / 1000 > payload.exp)) return null;
    return payload;
  }catch(e){ return null; }
}
// 微信绑定登录码（PG 表 wx_logins；小程序云函数经服务间密钥转发写入 confirmed）

// ---- LLM 兜底（双免费供应商故障转移：智谱 glm-4-flash 主 → 硅基流动 Qwen2.5-7B 备）----
const ZHIPU_KEY = 'f0d4847de0494325aad271ef1c5ff74e.NBNkn34ZpXDSBIRM';
const SILICON_KEY = 'sk-etwwwjyntfbarfkeunyqtyiicaetmhqnhwhxxabazmpmofvd';
function httpsPostJson(hostname, path, authKey, bodyStr, timeoutMs){
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authKey, 'Content-Length': Buffer.byteLength(bodyStr) },
      timeout: timeoutMs || 22000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { let j = null; try{ j = JSON.parse(d); }catch(e){} resolve({ status: res.statusCode, json: j }); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyStr); req.end();
  });
}
async function llmChat(messages){
  const call = async (hostname, path, key, model) => {
    const r = await httpsPostJson(hostname, path, key, JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.2 }), 22000);
    if(r.status === 429) throw Object.assign(new Error('HTTP 429'), { rateLimited: true });
    if(r.status !== 200) throw new Error('HTTP ' + r.status);
    const c = r.json && r.json.choices && r.json.choices[0] && r.json.choices[0].message;
    const content = (c && c.content || '').trim();
    if(!content) throw new Error('empty');
    return content;
  };
  // 智谱优先；429 退避重试一次；仍失败或其它错误 → 切硅基流动
  try{
    try{ return { content: await call('open.bigmodel.cn', '/api/paas/v4/chat/completions', ZHIPU_KEY, 'glm-4-flash'), provider: 'zhipu' }; }
    catch(e1){
      if(e1 && e1.rateLimited){
        await new Promise(r2 => setTimeout(r2, 900));
        try{ return { content: await call('open.bigmodel.cn', '/api/paas/v4/chat/completions', ZHIPU_KEY, 'glm-4-flash'), provider: 'zhipu' }; }catch(e2){}
      }
    }
    return { content: await call('api.siliconflow.cn', '/v1/chat/completions', SILICON_KEY, 'Qwen/Qwen2.5-7B-Instruct'), provider: 'silicon' };
  }catch(e){
    return null;
  }
}

// TC3-HMAC-SHA256 直签（JSON 载荷；opts 可指定 host/service/version 以调用不同云产品，默认 TCB）
function callApi(action, payload, opts){
  opts = opts || {};
  const HOSTN = opts.host || HOST;
  const SVC = opts.service || 'tcb';
  const VER = opts.version || API_VER;
  const REG = opts.region || REGION;
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload || {});
    const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + HOSTN + '\nx-tc-action:' + action.toLowerCase() + '\n';
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = 'POST' + '\n' + '/' + '\n' + '' + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + sha256hex(body);
    const stringToSign = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/' + SVC + '/tc3_request\n' + sha256hex(canonicalRequest);
    const kDate = hmacBuf('TC3' + process.env.TCB_SECRET_KEY, date);
    const kService = hmacBuf(kDate, SVC);
    const kSigning = hmacBuf(kService, 'tc3_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const auth = 'TC3-HMAC-SHA256 Credential=' + process.env.TCB_SECRET_ID + '/' + date + '/' + SVC + '/tc3_request, SignedHeaders=' + signedHeaders + ', Signature=' + signature;
    const req = https.request({
      hostname: HOSTN, path: '/', method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': HOSTN,
        'X-TC-Action': action,
        'X-TC-Region': REG,
        'X-TC-Timestamp': String(ts),
        'X-TC-Version': VER,
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

// 管理员名单改为读 admins 表（可随时 INSERT/DELETE uid 换管理员，无需改代码）
let __tablesReady = false;               // 自愈建表每实例只跑一次
const __adminCache = { ts: 0, list: [] };
async function getAdminUids(){
  // 注意：云函数内 callApi 已解包 Response（resolve j.Response），错误时 reject
  if(Date.now() - __adminCache.ts < 30000) return __adminCache.list;   // 30s 内存缓存
  try{
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT uid FROM admins" });
    const list = ((r && r.Rows) || []).map(x => { try{ return String(JSON.parse(x)[0] || '').replace(/[\s\u200B-\u200D\uFEFF]/g, ''); }catch(e){ return String(x).replace(/[\s\u200B-\u200D\uFEFF]/g, ''); } }).filter(Boolean);
    __adminCache.ts = Date.now(); __adminCache.list = list;
    return list;
  }catch(e){ return []; }
}

// 登录用户登记表：verifyToken 顺带 UPSERT（每实例每 uid 只写一次）
const __userSeen = new Set();
async function upsertUser(uid, email){
  if(!uid || __userSeen.has(uid)) return;
  __userSeen.add(uid);
  try{
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO users (uid, email) VALUES ('" + esc(uid) + "', '" + esc(email || '') + "') ON CONFLICT (uid) DO UPDATE SET email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email)" });
  }catch(e){}
}

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
          if(res.statusCode === 200 && j && j.sub){
            resolve({ uid: j.sub, email: j.email || j.username || '' });
          } else resolve(null);
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

    // ---- 小程序直登：wx.login code → code2session → 自签会话（免 token 白名单） ----
    if(action === 'wxLogin'){
      if(!WX_APPID || !WX_APPSECRET) return json(503, { ok: false, error: '小程序直登未配置' });
      const code = String((body || {}).code || '').slice(0, 128);
      if(!code) return json(400, { ok: false, error: '参数缺失' });
      const sess = await httpsGetJson('api.weixin.qq.com', '/sns/jscode2session?appid=' + WX_APPID + '&secret=' + WX_APPSECRET + '&js_code=' + encodeURIComponent(code) + '&grant_type=authorization_code');
      if(!sess || !sess.openid) return json(200, { ok: false, error: '微信登录失败(' + ((sess && sess.errcode) || 'network') + ')' });
      const openid = String(sess.openid).slice(0, 64);
      const uid = wxUid(openid);
      try{ await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO users (uid, email) VALUES ('" + uid + "', '" + esc(String(openid).slice(0, 12)) + "@wx') ON CONFLICT (uid) DO NOTHING" }); }catch(e){}
      const now = Math.floor(Date.now() / 1000);
      const access = wxSign({ sub: uid, typ: 'access', exp: now + 7200 });
      const refresh = wxSign({ sub: uid, typ: 'refresh', exp: now + 30 * 86400 });
      return json(200, { ok: true, uid, access_token: access, refresh_token: refresh });
    }

    // ---- 微信登录（匿名区）：发起绑定码 / 轮询 / 刷新自签会话 / 服务间绑定确认 ----
    if(action === 'wxLoginCreate' || action === 'wxLoginPoll' || action === 'wxRefresh' || action === 'wxBind'){
      if(!WX_SECRET) return json(503, { error: '微信登录未启用' });
      if(action === 'wxLoginCreate'){
        const loginId = String(Math.floor(100000 + Math.random() * 900000));
        try{
          await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS wx_logins (login_id TEXT PRIMARY KEY, openid TEXT, status TEXT DEFAULT 'pending', nickname TEXT, avatar TEXT, exp BIGINT)" });
          await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO wx_logins (login_id, status, exp) VALUES ('" + loginId + "', 'pending', " + (Date.now() + 5 * 60 * 1000) + ") ON CONFLICT (login_id) DO UPDATE SET status='pending', openid=NULL, exp=EXCLUDED.exp" });
          return json(200, { ok: true, loginId, expiresIn: 300 });
        }catch(e){ return json(500, { error: '登录码生成失败: ' + String((e && e.message) || e).slice(0, 80) }); }
      }
      if(action === 'wxBind'){
        // 仅小程序云函数（持服务间密钥）可调
        if(String((body || {}).bindSecret || '') !== WX_SECRET) return json(403, { error: 'forbidden' });
        const loginId = String((body || {}).loginId || '').replace(/\D/g, '').slice(0, 6);
        const openid = String((body || {}).openid || '').slice(0, 64);
        if(loginId.length !== 6 || !openid) return json(400, { error: '参数缺失' });
        const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "UPDATE wx_logins SET openid='" + esc(openid) + "', status='confirmed', nickname='" + esc(String((body || {}).nickname || '').slice(0, 12)) + "', avatar='" + esc(String((body || {}).avatar || '').slice(0, 400000)) + "' WHERE login_id='" + loginId + "' AND (exp IS NULL OR exp > " + Date.now() + ")" });
        const ok = Number((r && r.AffectedRows) || 0) > 0;
        return json(ok ? 200 : 404, ok ? { ok: true } : { error: '登录码不存在或已过期' });
      }
      if(action === 'wxLoginPoll'){
        const loginId = String((body || {}).loginId || '').replace(/\D/g, '').slice(0, 6);
        if(loginId.length !== 6) return json(400, { ok: false, error: '参数缺失' });
        const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT login_id, openid, status, nickname, avatar, exp FROM wx_logins WHERE login_id='" + loginId + "'" });
        let a = null;
        try{ a = JSON.parse(r.Rows[0]); }catch(e){}
        if(!a) return json(200, { ok: true, status: 'not_found' });
        const openid = a[1], status = a[2], nickname = a[3], avatar = a[4], exp = Number(a[5]) || 0;
        if(exp && exp < Date.now()) return json(200, { ok: true, status: 'expired' });
        if(status !== 'confirmed' || !openid) return json(200, { ok: true, status: status || 'pending' });
        const uid = wxUid(openid);
        try{
          await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO users (uid, email) VALUES ('" + uid + "', '" + esc(String(openid).slice(0, 12)) + "@wx') ON CONFLICT (uid) DO NOTHING" });
        }catch(e){}
        const now = Math.floor(Date.now() / 1000);
        const access = wxSign({ sub: uid, typ: 'access', exp: now + 7200 });
        const refresh = wxSign({ sub: uid, typ: 'refresh', exp: now + 30 * 86400 });
        try{ await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM wx_logins WHERE login_id='" + loginId + "'" }); }catch(e){}
        return json(200, { ok: true, status: 'confirmed', uid, access_token: access, refresh_token: refresh, nickname: nickname || '', avatar: avatar || '' });
      }
      // wxRefresh
      const rt = String((body || {}).refresh_token || '');
      const p = wxVerify(rt);
      if(!p || p.typ !== 'refresh') return json(401, { error: '会话已过期，请重新登录' });
      const now = Math.floor(Date.now() / 1000);
      return json(200, { ok: true, uid: p.sub, access_token: wxSign({ sub: p.sub, typ: 'access', exp: now + 7200 }), refresh_token: rt, expires_in: 7200, sub: p.sub });
    }

    // 匿名可读动作（公共信息流 / 取全图）：无 token 也可用
    const ANON_ACTIONS = ['feed', 'photo'];
    let uid = null;
    if(ANON_ACTIONS.indexOf(action) >= 0 && !token){
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, uid TEXT, nickname TEXT, type TEXT, name TEXT, descr TEXT, photos TEXT, likes INT DEFAULT 0, liked_by TEXT DEFAULT '[]', reports INT DEFAULT 0, report_by TEXT DEFAULT '[]', hidden BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS addr TEXT" });
      return await handlePostAction(action, body, null);
    }

    if(!token) return json(401, { error: '缺少登录凭据' });
    // 双轨验证：微信自签会话优先，否则走认证网关
    let me = null;
    const wxPayload = wxVerify(token);
    if(wxPayload && wxPayload.typ === 'access'){
      me = { uid: wxPayload.sub, email: '' };
    } else {
      me = await verifyToken(token);
    }
    if(!me) return json(401, { error: '登录状态无效或已过期' });
    uid = me.uid;

    // 自愈建表（每函数实例只跑一次，避免每次请求十几条 SQL 触发云数据库限频）
    if(!__tablesReady){
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS profiles (uid TEXT PRIMARY KEY, avatar TEXT, updated_at TIMESTAMPTZ DEFAULT now())" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, uid TEXT, nickname TEXT, type TEXT, name TEXT, descr TEXT, photos TEXT, likes INT DEFAULT 0, liked_by TEXT DEFAULT '[]', reports INT DEFAULT 0, report_by TEXT DEFAULT '[]', hidden BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS addr TEXT" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, post_id TEXT, uid TEXT, nickname TEXT, content TEXT, created TIMESTAMPTZ DEFAULT now())" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE comments ADD COLUMN IF NOT EXISTS reports INT DEFAULT 0" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE comments ADD COLUMN IF NOT EXISTS report_by TEXT DEFAULT '[]'" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE comments ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE comments ADD COLUMN IF NOT EXISTS review_source TEXT DEFAULT ''" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_source TEXT DEFAULT ''" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, uid TEXT, city TEXT, content TEXT, created TIMESTAMPTZ DEFAULT now())" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, email TEXT DEFAULT '')" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT ''" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS admins (uid TEXT PRIMARY KEY)" });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, uid TEXT, data TEXT, updated_at BIGINT DEFAULT 0)" });
      __tablesReady = true;
    }
    await upsertUser(uid, me.email);   // 同步登记（函数可能随时冻结，不留给后台）

    // 分享相关动作（uid 已验证）
    const POST_ACTIONS = ['publish', 'feed', 'mine', 'like', 'del', 'report', 'photo'];
    if(POST_ACTIONS.indexOf(action) >= 0) return await handlePostAction(action, body, uid);
    // ---- 评论 ----
    if(action === 'commentAdd'){
      const postId = String((body || {}).id || '').slice(0, 40);
      const content = String((body || {}).content || '').trim().slice(0, 200);
      if(!postId || !content) return json(400, { ok: false, error: '评论内容不能为空' });
      if(hasBadWord(content)) return json(400, { ok: false, error: '评论含违规内容，请修改后再发' });
      const nickname = sanitizeText(String((body || {}).nickname || '路过的朋友').slice(0, 20));
      if(hasBadWord(nickname)) return json(400, { ok: false, error: '昵称含违规内容，请修改后再发' });
      if(!rateOk('cm' + uid)) return json(429, { ok: false, error: '发送太频繁，请稍后再试' });
      const tmsC = await tmsTextCheck(content);
      if(tmsC === 'block') return json(400, { ok: false, error: '评论含违规内容，请修改后再发' });
      const hideOnReview = tmsC === 'review';
      const cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO comments (id, post_id, uid, nickname, content, hidden, review_source) VALUES ('" + esc(cid) + "', '" + esc(postId) + "', '" + esc(uid) + "', '" + esc(nickname) + "', '" + esc(content) + "', " + (hideOnReview ? 'true' : 'false') + ", '" + (hideOnReview ? 'tms' : '') + "')" });
      return json(200, { ok: true, cid });
    }
    if(action === 'commentList'){
      const postId = String((body || {}).id || '').slice(0, 40);
      if(!postId) return json(400, { ok: false, error: '参数缺失' });
      const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT c.id, c.uid, c.nickname, c.content, to_char(c.created, 'MM-DD HH24:MI'), (c.uid = p.uid), p.uid FROM comments c LEFT JOIN posts p ON p.id = c.post_id WHERE c.post_id = '" + esc(postId) + "' AND c.hidden = false ORDER BY c.created ASC LIMIT 200" });
      const list = ((r && r.Rows) || []).map(x => { try{ const a = JSON.parse(x); return { cid: a[0], uid: a[1], nickname: a[2], content: a[3], time: a[4], isOp: a[5] === true || a[5] === 'true', ownerUid: a[6] || '' }; }catch(e){ return null; } }).filter(Boolean);
      return json(200, { ok: true, list });
    }
    if(action === 'commentDel'){
      const cid = String((body || {}).cid || '').slice(0, 40);
      if(!cid) return json(400, { ok: false, error: '参数缺失' });
      // 权限：评论作者 / 帖子主人 / 管理员
      const cr = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT c.uid, p.uid FROM comments c LEFT JOIN posts p ON p.id = c.post_id WHERE c.id = '" + esc(cid) + "'" });
      if(!cr || !cr.Rows || !cr.Rows.length) return json(404, { ok: false, error: '评论不存在' });
      let commentUid = '', postOwner = '';
      try{ const row = JSON.parse(cr.Rows[0]); commentUid = row[0] || ''; postOwner = row[1] || ''; }catch(e){}
      const isAdmin = (await getAdminUids()).indexOf(uid) >= 0;
      if(!isAdmin && uid !== commentUid && uid !== postOwner) return json(403, { ok: false, error: '没有权限删除该评论' });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM comments WHERE id = '" + esc(cid) + "'" });
      return json(200, { ok: true });
    }
    if(action === 'commentReport'){
      const cid = String((body || {}).cid || '').slice(0, 40);
      if(!cid) return json(400, { ok: false, error: '参数缺失' });
      const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT report_by, hidden FROM comments WHERE id = '" + esc(cid) + "'" });
      if(!r || !r.Rows || !r.Rows.length) return json(404, { ok: false, error: '评论不存在' });
      let reportBy = []; let hidden = false;
      try{ const row = JSON.parse(r.Rows[0]); reportBy = JSON.parse(row[0] || '[]') || []; hidden = pgBool(row[1]); }catch(e){}
      if(hidden) return json(200, { ok: true, already: true });
      if(reportBy.indexOf(uid) >= 0) return json(200, { ok: true, already: true });
      reportBy.push(uid);
      const reports = reportBy.length;
      const hideNow = reports >= COMMENT_HIDE_THRESHOLD;
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "UPDATE comments SET reports = " + reports + ", report_by = '" + esc(JSON.stringify(reportBy)) + "'" + (hideNow ? ", hidden = true" : "") + " WHERE id = '" + esc(cid) + "'" });
      return json(200, { ok: true, hiddenNow: !!hideNow });
    }
    // ---- LLM 兜底（精灵助手）：需登录，限流防滥用 ----
    if(action === 'llm'){
      const msgs = Array.isArray((body || {}).messages) ? body.messages : [];
      const safe = msgs.slice(-8).map(m => ({ role: String(m.role || 'user').slice(0, 10), content: String(m.content || '').slice(0, 600) }));
      if(!safe.length) return json(400, { ok: false, error: 'messages 缺失' });
      const r = await llmChat(safe);
      if(!r) return json(200, { ok: false, error: 'AI 服务暂不可用，请稍后再试' });
      return json(200, { ok: true, content: r.content, provider: r.provider });
    }
    // ---- 在线心跳：前台用户定期上报，刷新 last_seen ----
    if(action === 'heartbeat'){
      const nickname = String((body || {}).nickname || '').slice(0, 20);
      const em = esc(me.email || '');
      const nk = esc(nickname);
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO users (uid, email, nickname, last_seen) VALUES ('" + esc(uid) + "', '" + em + "', '" + nk + "', now()) ON CONFLICT (uid) DO UPDATE SET last_seen = now(), nickname = CASE WHEN '" + nk + "' <> '' THEN '" + nk + "' ELSE users.nickname END, email = COALESCE(NULLIF('" + em + "', ''), users.email)" });
      return json(200, { ok: true });
    }
    // ---- 管理员 ----
    if(action === 'adminCheck'){
      const admins = await getAdminUids();
      return json(200, { ok: true, isAdmin: admins.indexOf(uid) >= 0 });
    }
    if(action === 'adminAction'){
      if((await getAdminUids()).indexOf(uid) < 0) return json(403, { ok: false, error: '需要管理员权限' });
      const op = String((body || {}).op || '');
      // 用户在线情况（管理员）
      if(op === 'users'){
        const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT uid, email, nickname, to_char(last_seen, 'YYYY-MM-DD HH24:MI:SS'), COALESCE(EXTRACT(EPOCH FROM (now() - last_seen)), -1) FROM users ORDER BY COALESCE(last_seen, to_timestamp(0)) DESC LIMIT 200" });
        const list = ((r && r.Rows) || []).map(x => { try{ const a = JSON.parse(x); return { uidTail: String(a[0] || '').slice(-6), email: a[1] || '', nickname: a[2] || '', lastSeen: a[3] || '', agoSec: Number(a[4]) }; }catch(e){ return null; } }).filter(Boolean);
        return json(200, { ok: true, list });
      }
      if(op === 'hidePost' || op === 'unhidePost'){
        const id = String((body || {}).id || '').slice(0, 40);
        await callApi('ExecutePGSql', { EnvId: ENV, Sql: "UPDATE posts SET hidden = " + (op === 'hidePost' ? 'true' : 'false') + (op === 'unhidePost' ? ", review_source = ''" : '') + " WHERE id = '" + esc(id) + "'" });
        return json(200, { ok: true });
      }
      if(op === 'delPost'){
        const id = String((body || {}).id || '').slice(0, 40);
        await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM comments WHERE post_id = '" + esc(id) + "'" });
        await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM posts WHERE id = '" + esc(id) + "'" });
        return json(200, { ok: true });
      }
      if(op === 'delComment'){
        const cid = String((body || {}).cid || '').slice(0, 40);
        await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM comments WHERE id = '" + esc(cid) + "'" });
        return json(200, { ok: true });
      }
      if(op === 'unhideComment'){
        const cid = String((body || {}).cid || '').slice(0, 40);
        await callApi('ExecutePGSql', { EnvId: ENV, Sql: "UPDATE comments SET hidden = false, reports = 0, report_by = '[]', review_source = '' WHERE id = '" + esc(cid) + "'" });
        return json(200, { ok: true });
      }
      if(op === 'pending'){
        const rp = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT id, nickname, type, name, addr, reports, to_char(created_at, 'MM-DD HH24:MI'), COALESCE(review_source, '') FROM posts WHERE hidden = true ORDER BY reports DESC, created_at DESC LIMIT 50" });
        const rc = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT c.id, c.nickname, c.content, c.reports, c.post_id, p.name, COALESCE(c.review_source, '') FROM comments c LEFT JOIN posts p ON p.id = c.post_id WHERE c.hidden = true ORDER BY c.reports DESC, c.created DESC LIMIT 50" });
        const posts = ((rp && rp.Rows) || []).map(x => { try{ const a = JSON.parse(x); return { id: a[0], nickname: a[1], type: a[2], name: a[3], addr: a[4], reports: Number(a[5]) || 0, time: a[6], src: a[7] || 'report' }; }catch(e){ return null; } }).filter(Boolean);
        const comments = ((rc && rc.Rows) || []).map(x => { try{ const a = JSON.parse(x); return { cid: a[0], nickname: a[1], content: a[2], reports: Number(a[3]) || 0, pid: a[4], pname: a[5] || '', src: a[6] || 'report' }; }catch(e){ return null; } }).filter(Boolean);
        return json(200, { ok: true, posts, comments });
      }
      return json(400, { ok: false, error: '未知管理操作' });
    }
    if(action === 'myComments'){
      const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT c.id, c.post_id, c.content, to_char(c.created, 'YYYY-MM-DD HH24:MI'), p.name, p.type, p.addr, p.hidden FROM comments c LEFT JOIN posts p ON p.id = c.post_id WHERE c.uid = '" + esc(uid) + "' ORDER BY c.created DESC LIMIT 100" });
      const list = ((r && r.Rows) || []).map(x => { try{ const a = JSON.parse(x); return { cid: a[0], pid: a[1], content: a[2], time: a[3], pname: a[4] || '', ptype: a[5] || '', paddr: a[6] || '', hidden: a[7] === true || a[7] === 'true' }; }catch(e){ return null; } }).filter(Boolean);
      return json(200, { ok: true, list });
    }
    // ---- 旅游攻略 ----
    if(action === 'planSave'){
      const city = String((body || {}).city || '').trim().slice(0, 24);
      const content = String((body || {}).content || '').slice(0, 60000);
      if(!city || !content) return json(400, { ok: false, error: '参数缺失' });
      const pid = 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO plans (id, uid, city, content) VALUES ('" + esc(pid) + "', '" + esc(uid) + "', '" + esc(city) + "', '" + esc(content) + "')" });
      return json(200, { ok: true, pid });
    }
    if(action === 'planList'){
      const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT id, city, content, to_char(created, 'YYYY-MM-DD HH24:MI') FROM plans WHERE uid = '" + esc(uid) + "' ORDER BY created DESC LIMIT 50" });
      const list = ((r && r.Rows) || []).map(x => { try{ const a = JSON.parse(x); let items = [], planDate = ''; try{ const c = JSON.parse(a[2] || '{}'); items = c.items || []; planDate = String(c.dateIso || ''); }catch(e){} return { pid: a[0], city: a[1], items, time: a[3], planDate }; }catch(e){ return null; } }).filter(Boolean);
      return json(200, { ok: true, list });
    }
    if(action === 'planDel'){
      const pid = String((body || {}).pid || '').slice(0, 40);
      if(!pid) return json(400, { ok: false, error: '参数缺失' });
      await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM plans WHERE id = '" + esc(pid) + "' AND uid = '" + esc(uid) + "'" });
      return json(200, { ok: true });
    }
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
// ---- 治理配置 ----
const COMMENT_HIDE_THRESHOLD = 3;
// 管理员名单已迁移到 admins 表（uid 白名单），由 getAdminUids() 读取
function badAddr(s){
  const t = String(s || '');
  return /https?:\/\/|www\./i.test(t) || /^\d+$/.test(t.trim());
}

/* ---- 内容安全增强 ---- */
// 腾讯云 TMS 文本内容安全（机器审核）：pass 通过 / review 疑似人工 / block 违规 / off 未开通或失败（降级词库）
async function tmsTextCheck(content){
  try{
    if(!process.env.TCB_SECRET_ID || !process.env.TCB_SECRET_KEY) return 'off';
    const r = await callApi('TextModeration', { Content: Buffer.from(String(content || '').slice(0, 4000), 'utf8').toString('base64') },
      { host: 'tms.tencentcloudapi.com', service: 'tms', version: '2020-12-29' });
    const sug = ((r || {}).Response && r.Response.Suggestion) || '';
    if(sug === 'Block') return 'block';
    if(sug === 'Review') return 'review';
    return 'pass';
  }catch(e){ return 'off'; }   // 未开通/限频/网络失败 → 降级为仅词库，不阻塞发布
}
// 昵称等短文本清洗：去零宽字符与首尾空白
function sanitizeText(s){
  return String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}
// 发频率限制：内存滑动窗口（实例级），同一 uid 每 60 秒内最多 3 次
const __rateMap = new Map();
function rateOk(key){
  try{
    const now = Date.now();
    let arr = __rateMap.get(key) || [];
    arr = arr.filter(x => now - x < 60000);
    if(arr.length >= 3){ __rateMap.set(key, arr); return false; }
    arr.push(now);
    __rateMap.set(key, arr);
    if(__rateMap.size > 5000) __rateMap.clear();   // 防内存膨胀
    return true;
  }catch(e){ return true; }
}
// 文本规范化 + 谐音变体还原：全角→半角、去零宽字符、常见符号夹杂剔除、拼音谐音映射，再交给词库匹配
function normalizeText(s){
  let t = String(s || '');
  t = t.replace(/[\u200B-\u200D\uFEFF]/g, '');
  t = t.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  t = t.replace(/[·•|!！,，。.\s*#＃^～~_\-]/g, '');
  t = t.replace(/微|威|薇|危/g, 'V').replace(/[qＱ]/gi, 'Q');
  t = t.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '');   // 只保留中英文与数字，emoji/符号夹杂混淆全部失效
  return t;
}
const BAD_WORDS = ['加微信','加V','加v','＋V','赌博','博彩','下注','代开发票','色情','约炮','刷单','点赞返现','兼职日结','高利贷','办证','外挂','代练','转账返','资金盘','裸聊','枪支',
  '加Q','企鹅',' leds',' prostitute','援交','一夜情','包养','代孕','卖淫','嫖娼','毒品','冰毒','摇头丸',' K粉','迷奸','迷药','安眠药','自杀','自残',
  '加weixin','加V信','加w信','刷钻','刷枪','外币','汇率优惠','赃物','销赃','收购银行卡','四件套','对公账户','跑分','洗钱','放贷','砍头息','网贷','逾期处理','征信修复',
  '信用卡套现','养卡','提额','赌博网站','六合彩','北京赛车','幸运飞艇','时时彩','百家乐','德扑','棋牌娱乐','代理招商','加盟返利','宠物活体','违禁品',
  '真枪','弹药','炸药','雷管','管制刀具','监听','窃听','定位他人','查开房','查住址','查身份','黑客','入侵','数据恢复',' dump','接单','接单日结',
  '推广引流','广告投放','粉丝买卖','刷粉','刷量','刷阅读','刷关注','代点赞','点赞一族','互粉','互赞群','僵尸粉',
  '威信同号','Q我','Q聊','加我','联系我','私聊我','私我','滴滴我','扣我','敲我','戳我','+v','＋v','＋Q','+q','（+V）','（+Q）'];
function hasBadWord(s){
  const t = String(s || '');
  const n = normalizeText(t);
  for(const w of BAD_WORDS){
    const wn = normalizeText(w);
    if(t.indexOf(w) >= 0) return true;
    if(wn && wn.length >= 2 && n.indexOf(wn) >= 0) return true;   // 规范化后至少 2 字符，防单字符误伤
  }
  // 引流模式：V/Q 开头 + 数字引导的 6-12 位账号形态（微信号/QQ号），且原文带社交语境词
  const n2 = n.replace(/[^a-z0-9]/gi, '');
  if(/[vVQq]{1,2}[0-9a-zA-Z]{6,12}/.test(n2) && /加|私|聊|联系|同号|君羊|薇|威/.test(t)) return true;
  if(/君羊|條|艹|莪|迩|仩|牜|嫑|嘦|甭|氼/.test(t)) return true;   // 拆字/生僻替代字
  return false;
}
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
    const nickname = sanitizeText(String(p.nickname || '路过的朋友').slice(0, 20));
    if(hasBadWord(nickname)) return json(400, { ok: false, error: '昵称含违规内容，请修改后发布' });
    if(!rateOk('pb' + uid)) return json(429, { ok: false, error: '发布太频繁，请稍后再试' });
    let photos = Array.isArray(p.photos) ? p.photos.slice(0, MAX_PHOTOS) : [];
    photos = photos.map(x => (typeof x === 'string') ? { t: x, f: x } : x).filter(x => x && typeof x.t === 'string');
    if(!addr) return json(400, { ok: false, error: '请填写地址' });
    if(badAddr(addr)) return json(400, { ok: false, error: '地址格式不合规，请填写真实地址' });
    if(hasBadWord(name) || hasBadWord(addr) || hasBadWord(desc)) return json(400, { ok: false, error: '内容含违规词，请修改后发布' });
    const tmsP = await tmsTextCheck((name || '') + '\n' + (addr || '') + '\n' + (desc || ''));
    if(tmsP === 'block') return json(400, { ok: false, error: '内容含违规信息，请修改后发布' });
    const hideOnReview = tmsP === 'review';
    for(const ph of photos){
      if(typeof ph.f === 'string') ph.f = ph.f.slice(0, 400000);
      if(typeof ph.t === 'string') ph.t = ph.t.slice(0, 60000);
    }
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await callApi('ExecutePGSql', { EnvId: ENV, Sql:
      "INSERT INTO posts (id, uid, nickname, type, name, addr, descr, photos, hidden, review_source, created_at) VALUES ('" +
      esc(id) + "', '" + esc(uid) + "', '" + esc(nickname) + "', '" + esc(type) + "', '" + esc(name) + "', '" + esc(addr) + "', '" + esc(desc) + "', '" +
      esc(JSON.stringify(photos)) + "', " + (hideOnReview ? 'true' : 'false') + ", '" + (hideOnReview ? 'tms' : '') + "', now())" });
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

  // ---- 单帖获取（评论跳转等） ----
  if(action === 'postGet'){
    const postId = String(body.id || '').slice(0, 40);
    if(!postId) return json(400, { ok: false, error: '参数缺失' });
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql:
      "SELECT p.id, p.uid, p.nickname, p.type, p.name, p.addr, p.descr, p.photos, p.likes, p.liked_by, p.hidden, to_char(p.created_at, 'YYYY-MM-DD HH24:MI'), pr.avatar FROM posts p LEFT JOIN profiles pr ON pr.uid = p.uid WHERE p.id = '" + esc(postId) + "' AND p.hidden = false" });
    const line = r && r.Rows && r.Rows[0];
    if(!line) return json(404, { ok: false, error: '帖子不存在或已删除' });
    const row = JSON.parse(line);
    return json(200, { ok: true, post: rowToPost(row, uid) });
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

  // ---- 事件云同步（安卓端：PG 表 events，uid 归属，updated_at 幂等，对齐小程序 eventSync 设计） ----
  if(action === 'eventPush'){
    if(!me) return json(401, { ok: false, error: '请先登录' });
    const list = Array.isArray(body.events) ? body.events : [];
    let saved = 0;
    for(const raw of list){
      if(!raw || typeof raw.id !== 'string' || !raw.id) continue;
      const ua = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now();
      const clean = Object.assign({}, raw, { updatedAt: ua });
      delete clean.voiceData;   // 录音 dataUrl 不上云（本地资源）
      try{
        const found = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT updated_at FROM events WHERE id = '" + esc(raw.id) + "' AND uid = '" + esc(uid) + "'" });
        if(found && found.Rows && found.Rows.length){
          const cloudAt = Number(JSON.parse(found.Rows[0])[0]) || 0;
          if(ua >= cloudAt){
            await callApi('ExecutePGSql', { EnvId: ENV, Sql: "UPDATE events SET data = '" + esc(JSON.stringify(clean)) + "', updated_at = " + ua + " WHERE id = '" + esc(raw.id) + "' AND uid = '" + esc(uid) + "'" });
            saved++;
          }
        } else {
          await callApi('ExecutePGSql', { EnvId: ENV, Sql: "INSERT INTO events (id, uid, data, updated_at) VALUES ('" + esc(raw.id) + "', '" + esc(uid) + "', '" + esc(JSON.stringify(clean)) + "', " + ua + ")" });
          saved++;
        }
      }catch(e){ /* 单条失败继续 */ }
    }
    return json(200, { ok: true, op: 'eventPush', saved });
  }

  if(action === 'eventPull'){
    if(!me) return json(401, { ok: false, error: '请先登录' });
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: "SELECT data FROM events WHERE uid = '" + esc(uid) + "' LIMIT 1000" });
    // Rows 每行是"字符串化的值数组"：双层解析得 [data字符串]，data 字符串再 parse 成事件对象
    const events = (r && r.Rows ? r.Rows : []).map(line => {
      try{
        const arr = JSON.parse(JSON.parse(line));
        const v = arr[0];
        return typeof v === 'string' ? JSON.parse(v) : v;
      }catch(e){ return null; }
    }).filter(Boolean);
    return json(200, { ok: true, op: 'eventPull', events });
  }

  if(action === 'eventDelOne'){
    if(!me) return json(401, { ok: false, error: '请先登录' });
    const eid = String(body.eventId || '').slice(0, 64);
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "DELETE FROM events WHERE id = '" + esc(eid) + "' AND uid = '" + esc(uid) + "'" });
    return json(200, { ok: true, op: 'eventDelOne' });
  }

  return json(400, { ok: false, error: '未知操作' });
}
