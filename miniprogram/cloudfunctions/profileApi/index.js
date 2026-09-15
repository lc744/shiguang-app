// 绸缪 · profileApi 云函数（微信云开发版）
// 职责：服务端验证新认证网关 Bearer token → 管理员权限读写 users 集合（自动建集合）
// 部署：微信开发者工具中右键本目录 → 上传并部署：云端安装依赖
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ENV = 'gerenceshi-d0gguq5u39b4b86b2';

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
    let body = {};
    try{ body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {}); }catch(e){}

    // 绑定码登录 App：openid 由云函数上下文取得（不可伪造）→ 转发给 app 端 profileApi（服务间密钥）
    if((body.action || '') === 'wxBindToApp'){
      const wxCtx = cloud.getWXContext();
      const openid = wxCtx && wxCtx.OPENID;
      if(!openid) return json(401, { error: '请在微信客户端中使用' });
      const loginId = String(body.loginId || '').replace(/\D/g, '').slice(0, 6);
      if(loginId.length !== 6) return json(400, { error: '请输入 6 位登录码' });
      const bindSecret = process.env.WX_BIND_SECRET || '';
      if(!bindSecret) return json(500, { error: '函数未配置转发密钥' });
      const fwdBody = JSON.stringify({
        action: 'wxBind',
        bindSecret,
        loginId,
        openid,
        nickname: String(body.nickname || '').slice(0, 12),
        avatar: String(body.avatar || '').slice(0, 400000),
      });
      const up = await new Promise((resolve) => {
        const rq = https.request({
          hostname: 'gerenceshi-d0gguq5u39b4b86b2-1479056464.tcloudbaseapp.com',
          path: '/profileApi', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(fwdBody) },
          timeout: 10000,
        }, (rs) => { let d = ''; rs.on('data', (c) => d += c); rs.on('end', () => { try{ resolve({ status: rs.statusCode, j: JSON.parse(d) }); }catch(e){ resolve({ status: rs.statusCode, j: {} }); } }); });
        rq.on('error', () => resolve({ status: 0, j: {} }));
        rq.on('timeout', () => { rq.destroy(); resolve({ status: 0, j: {} }); });
        rq.write(fwdBody); rq.end();
      });
      if(up.status === 200) return json(200, { ok: true, message: '绑定成功，请回到 App 查看结果' });
      const msg = (up.j && up.j.error) || (up.status === 404 ? '登录码不存在或已过期' : '转发失败，请重试');
      return json(up.status || 502, { error: msg });
    }

    const hdr = event.headers || {};
    const authz = hdr.authorization || hdr.Authorization || body.token || '';
    const token = String(authz).replace(/^Bearer\s+/i, '').trim();
    if(!token) return json(401, { error: '缺少登录凭据' });
    const uid = await verifyToken(token);
    if(!uid) return json(401, { error: '登录状态无效或已过期' });

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
