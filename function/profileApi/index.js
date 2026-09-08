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
    if(!token) return json(401, { error: '缺少登录凭据' });
    const uid = await verifyToken(token);
    if(!uid) return json(401, { error: '登录状态无效或已过期' });

    // 自愈建表
    await callApi('ExecutePGSql', { EnvId: ENV, Sql: "CREATE TABLE IF NOT EXISTS profiles (uid TEXT PRIMARY KEY, avatar TEXT, updated_at TIMESTAMPTZ DEFAULT now())" });

    const action = body.action || 'get';
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
