// 绸缪 · profileApi 云函数（SCF Web 函数形式：HTTP 服务器监听 9000）
// 职责：服务端验证新认证网关 Bearer token → 以 CAM 凭据读写 TCB users 集合（自动建集合）
const CloudBase = require('@cloudbase/node-sdk');
const http = require('https');

const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
const app = CloudBase.init({
  env: ENV,
  secretId: process.env.TCB_SECRET_ID,
  secretKey: process.env.TCB_SECRET_KEY,
});
const db = app.database();

function verifyToken(token){
  return new Promise((resolve) => {
    const req = http.request({
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

function json(res, code, obj){
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

async function handle(req, res){
  try{
    if(req.method === 'OPTIONS') return json(res, 200, { ok: true });
    let body = {};
    if(req.method === 'POST' || req.method === 'PUT'){
      let raw = '';
      await new Promise((resolve) => {
        req.on('data', (c) => { raw += c; if(raw.length > 3e6) req.destroy(); });
        req.on('end', resolve);
        req.on('error', resolve);
      });
      try{ body = JSON.parse(raw || '{}'); }catch(e){}
    }
    const authz = req.headers.authorization || body.token || '';
    const token = String(authz).replace(/^Bearer\s+/i, '').trim();
    if(!token) return json(res, 401, { error: '缺少登录凭据' });
    const uid = await verifyToken(token);
    if(!uid) return json(res, 401, { error: '登录状态无效或已过期' });

    // users 集合自愈创建（管理员权限）
    try{ await db.createCollection('users'); }catch(e){ /* 已存在即可 */ }
    const col = db.collection('users');

    const action = body.action || 'get';
    if(action === 'get'){
      let doc = null;
      try{ doc = await col.doc(uid).get(); }catch(e){}
      let profile = null;
      if(doc && doc.data){
        profile = Array.isArray(doc.data) ? (doc.data[0] || null) : doc.data;
      }
      return json(res, 200, { uid, profile });
    }
    if(action === 'save'){
      const p = body.profile || {};
      const clean = {};
      for(const k of ['nickname', 'gender', 'birth', 'avatar']){
        if(typeof p[k] === 'string') clean[k] = p[k].slice(0, 400000);
      }
      clean.updatedAt = new Date().toISOString();
      await col.doc(uid).set({ data: clean });
      return json(res, 200, { ok: true, uid });
    }
    return json(res, 400, { error: '未知操作: ' + String(action).slice(0, 40) });
  }catch(e){
    return json(res, 500, { error: String((e && e.message) || e).slice(0, 200) });
  }
}

const PORT = process.env.SCF_RUNTIME_PORT ? Number(process.env.SCF_RUNTIME_PORT) : 9000;
const server = require('http').createServer(handle);
server.listen(PORT, () => { console.log('profileApi listening on ' + PORT); });
