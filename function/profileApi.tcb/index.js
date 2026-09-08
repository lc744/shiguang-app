// 绸缪 · profileApi 云函数（腾讯云 TCB 控制台版）
// 用法：TCB 控制台 → 环境 gerenceshi → 云函数 → 新建云函数 profileApi(Nodejs16.13)
//       → 粘贴本代码 → package.json 加入 "@cloudbase/node-sdk": "^2" → 安装依赖 → 保存并部署
// 职责：服务端验证认证网关 Bearer token → 管理员读写 users 集合（自动建集合）
const CloudBase = require('@cloudbase/node-sdk');
const https = require('https');

const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
const app = CloudBase.init({ env: ENV });
const db = app.database();

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
    const hdr = event.headers || {};
    if(method === 'OPTIONS') return json(200, { ok: true });
    let body = {};
    try{ body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); }catch(e){}
    const authz = hdr.authorization || hdr.Authorization || body.token || '';
    const token = String(authz).replace(/^Bearer\s+/i, '').trim();
    if(!token) return json(401, { error: '缺少登录凭据' });
    const uid = await verifyToken(token);
    if(!uid) return json(401, { error: '登录状态无效或已过期' });

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
      return json(200, { uid, profile });
    }
    if(action === 'save'){
      const p = body.profile || {};
      const clean = {};
      for(const k of ['nickname', 'gender', 'birth', 'avatar']){
        if(typeof p[k] === 'string') clean[k] = p[k].slice(0, 400000);
      }
      clean.updatedAt = new Date().toISOString();
      await col.doc(uid).set({ data: clean });
      return json(200, { ok: true, uid });
    }
    return json(400, { error: '未知操作: ' + String(action).slice(0, 40) });
  }catch(e){
    return json(500, { error: String((e && e.message) || e).slice(0, 200) });
  }
};
