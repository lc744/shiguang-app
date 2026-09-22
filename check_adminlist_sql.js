// 临时排查 v3：与此前验证成功的脚本完全同构（callApi 原样），仅换 SQL
const crypto = require('crypto'), https = require('https');
const sec = JSON.parse(require('fs').readFileSync(__dirname + '/cloud_secrets.json', 'utf8'));
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
const HOST = 'tcb.tencentcloudapi.com';
const API_VER = '2018-06-08';
const REGION = 'ap-shanghai';

function sha256hex(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function hmacBuf(key, s){ return crypto.createHmac('sha256', key).update(s).digest(); }

function callApi(action, payload){
  const SVC = 'tcb';
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload || {});
    const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + HOST + '\nx-tc-action:' + action.toLowerCase() + '\n';
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = 'POST' + '\n' + '/' + '\n' + '' + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + sha256hex(body);
    const stringToSign = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/' + SVC + '/tc3_request\n' + sha256hex(canonicalRequest);
    const kDate = hmacBuf('TC3' + sec.secretKey, date);
    const kService = hmacBuf(kDate, SVC);
    const kSigning = hmacBuf(kService, 'tc3_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const auth = 'TC3-HMAC-SHA256 Credential=' + sec.secretId + '/' + date + '/' + SVC + '/tc3_request, SignedHeaders=' + signedHeaders + ', Signature=' + signature;
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
        }catch(e){ reject(new Error('响应解析失败: ' + d.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API超时')); });
    req.write(body);
    req.end();
  });
}

(async () => {
  try{
    const sql = "SELECT uid, nickname, EXTRACT(EPOCH FROM (now() - last_seen))::BIGINT AS ago FROM users WHERE last_seen IS NOT NULL AND last_seen > now() - interval '90 days' ORDER BY last_seen DESC LIMIT 200";
    const r = await callApi('ExecutePGSql', { EnvId: ENV, Sql: sql });
    console.log('成功! Rows:', (r.Rows || []).length);
    (r.Rows || []).forEach((line, i) => {
      console.log('行' + i + ' 原始:', String(line).slice(0, 160));
      try{ console.log('     一层:', JSON.stringify(JSON.parse(line)).slice(0, 160)); }catch(e){}
      try{ const two = JSON.parse(JSON.parse(line)); console.log('     二层:', JSON.stringify(two).slice(0, 160), '| 长度:', Array.isArray(two) ? two.length : typeof two); }catch(e){}
    });
  }catch(e){ console.log('失败:', e.message); }
})();
