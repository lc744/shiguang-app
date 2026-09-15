// 临时：验证新密钥 + 查认证用户列表
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const sec = JSON.parse(fs.readFileSync(__dirname + '/cloud_secrets.json', 'utf8'));
const ENV = 'gerenceshi-d0gguq5u39b4b86b2', REGION = 'ap-shanghai', HOST = 'tcb.tencentcloudapi.com';
function callApi(action, payload){
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload || {});
    const ch = 'content-type:application/json; charset=utf-8\nhost:' + HOST + '\nx-tc-action:' + action.toLowerCase() + '\n';
    const sh = 'content-type;host;x-tc-action';
    const cr = 'POST\n/\n\n' + ch + '\n' + sh + '\n' + crypto.createHash('sha256').update(body).digest('hex');
    const sts = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/tcb/tc3_request\n' + crypto.createHash('sha256').update(cr).digest('hex');
    const kD = crypto.createHmac('sha256', 'TC3' + sec.secretKey).update(date).digest();
    const kS = crypto.createHmac('sha256', kD).update('tcb').digest();
    const kSG = crypto.createHmac('sha256', kS).update('tc3_request').digest();
    const sig = crypto.createHmac('sha256', kSG).update(sts).digest('hex');
    const req = https.request({ hostname: HOST, path: '/', method: 'POST', headers: {
      'Content-Type': 'application/json; charset=utf-8', 'X-TC-Action': action, 'X-TC-Region': REGION, 'X-TC-Timestamp': String(ts), 'X-TC-Version': '2018-06-08',
      'Authorization': 'TC3-HMAC-SHA256 Credential=' + sec.secretId + '/' + date + '/tcb/tc3_request, SignedHeaders=' + sh + ', Signature=' + sig,
      'Content-Length': Buffer.byteLength(body),
    }, timeout: 20000 }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try{ resolve(JSON.parse(d)); }catch(e){ resolve(d); } }); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}
(async () => {
  // 1. 验证密钥：ExecutePGSql
  const ping = await callApi('ExecutePGSql', { EnvId: ENV, Sql: 'SELECT count(*) FROM posts' });
  console.log('密钥验证:', ping.Response && ping.Response.Error ? 'FAIL ' + JSON.stringify(ping.Response.Error) : 'OK');
  // 2. 认证用户列表（找 email 对应 uid）
  for(const action of ['DescribeAuthUsers']){
    const r = await callApi(action, { EnvId: ENV, Limit: 100, Offset: 0 });
    const resp = r.Response || {};
    if(resp.Error){ console.log(action, 'ERR:', JSON.stringify(resp.Error)); continue; }
    const users = resp.Users || resp.UserList || [];
    console.log(action, '共', resp.TotalCount !== undefined ? resp.TotalCount : users.length, '个用户');
    users.forEach(u => console.log(' ', JSON.stringify(u)));
  }
})();
