// 快速 PG 查询工具（TC3-HMAC-SHA256 直签 ExecutePGSql，与 profileApi callApi 同签名实现）
// 用法: node tools/pg_query.js "SELECT ..."
// 凭据从 cloud_secrets.json 或环境变量读取（仓库内不得硬编码）
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

let _sec = { id: process.env.TCB_SECRET_ID, key: process.env.TCB_SECRET_KEY };
if(!_sec.id || !_sec.key){
  try{
    const raw = fs.readFileSync(path.join(__dirname, '..', 'cloud_secrets.json'), 'utf8').replace(/^\uFEFF/, '');
    const j = JSON.parse(raw);
    _sec.id = _sec.id || j.TCB_SECRET_ID; _sec.key = _sec.key || j.TCB_SECRET_KEY;
  }catch(e){}
}
if(!_sec.id || !_sec.key){ console.log('缺凭据：请设置 TCB_SECRET_ID/TCB_SECRET_KEY 或提供 cloud_secrets.json'); process.exit(1); }
const SECRET_ID = _sec.id, SECRET_KEY = _sec.key;
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
const sql = process.argv[2] || 'SELECT 1';

const sha256hex = s => crypto.createHash('sha256').update(s).digest('hex');
const hmacBuf = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();

const ts = Math.floor(Date.now() / 1000);
const date = new Date(ts * 1000).toISOString().slice(0, 10);
const body = JSON.stringify({ EnvId: ENV, Sql: sql });

const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:tcb.tencentcloudapi.com\nx-tc-action:executepgsql\n';
const signedHeaders = 'content-type;host;x-tc-action';
const canonicalRequest = 'POST' + '\n' + '/' + '\n' + '' + '\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + sha256hex(body);
const stringToSign = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/tcb/tc3_request\n' + sha256hex(canonicalRequest);
const kDate = hmacBuf('TC3' + SECRET_KEY, date);
const kService = hmacBuf(kDate, 'tcb');
const kSigning = hmacBuf(kService, 'tc3_request');
const signature = hmacBuf(kSigning, stringToSign).toString('hex');
const auth = 'TC3-HMAC-SHA256 Credential=' + SECRET_ID + '/' + date + '/tcb/tc3_request, SignedHeaders=' + signedHeaders + ', Signature=' + signature;

const req = https.request({
  hostname: 'tcb.tencentcloudapi.com', path: '/', method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Host': 'tcb.tencentcloudapi.com',
    'X-TC-Action': 'ExecutePGSql',
    'X-TC-Region': 'ap-shanghai',
    'X-TC-Timestamp': String(ts),
    'X-TC-Version': '2018-06-08',
    'Authorization': auth,
    'Content-Length': Buffer.byteLength(body)
  },
  timeout: 15000
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (j.Response && j.Response.Error) { console.log('ERROR ' + j.Response.Error.Code + ': ' + j.Response.Error.Message); process.exit(1); }
      const rows = j.Response.Rows || [];
      rows.forEach(line => {
        const a = Array.isArray(line) ? line : JSON.parse(line);
        console.log(JSON.stringify(a));
      });
      if (!rows.length) console.log('(0 行)');
    } catch (e) { console.log('解析失败: ' + d.slice(0, 400)); }
  });
});
req.on('error', e => { console.log('请求失败: ' + e.message); process.exit(1); });
req.write(body);
req.end();
