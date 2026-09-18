// 试老 CMS 端点（部分"内容审核资源包"绑定老 CMS API）
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const secrets = JSON.parse(fs.readFileSync('cloud_secrets.json', 'utf8'));
const ID = secrets.secretId, KEY = secrets.secretKey;

function sha256hex(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function hmacHex(key, msg){ return crypto.createHmac('sha256', key).update(msg).digest('hex'); }

function callSvc(host, svc, ver, region, action, payload){
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload);
    const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + host + '\nx-tc-action:' + action.toLowerCase() + '\n';
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = 'POST\n/\n\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + sha256hex(body);
    const stringToSign = 'TC3-HMAC-SHA256\n' + ts + '\n' + date + '/' + svc + '/tc3_request\n' + sha256hex(canonicalRequest);
    const kDate = hmacHex('TC3' + KEY, date);
    const kService = hmacHex(Buffer.from(kDate, 'hex'), svc);
    const kSigning = hmacHex(Buffer.from(kService, 'hex'), 'tc3_request');
    const signature = hmacHex(Buffer.from(kSigning, 'hex'), stringToSign);
    const auth = 'TC3-HMAC-SHA256 Credential=' + ID + '/' + date + '/' + svc + '/tc3_request, SignedHeaders=' + signedHeaders + ', Signature=' + signature;
    const req = https.request({
      hostname: host, path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Host': host, 'X-TC-Action': action, 'X-TC-Region': region, 'X-TC-Timestamp': String(ts), 'X-TC-Version': ver, 'Authorization': auth, 'Content-Length': Buffer.byteLength(body) },
      timeout: 20000,
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try{ resolve(JSON.parse(d)); }catch(e){ reject(new Error('parse: ' + d.slice(0, 150))); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}

(async () => {
  const text = '今天天气真好';
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  // 老 CMS：cms.tencentcloudapi.com 2019-04-15（多地埋试）
  for(const rg of ['ap-shanghai', 'ap-guangzhou', '']):
  {
    // placeholder removed
  }
})()
