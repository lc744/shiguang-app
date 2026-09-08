// TC3-HMAC-SHA256 签名直调腾讯云 API（探测 TCB CommonServiceAPI 通用通道）
const crypto = require('crypto');
const https = require('https');
const secret = require(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json');

function tc3Call(service, host, action, version, payload){
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    const body = JSON.stringify(payload);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const hashedBody = crypto.createHash('sha256').update(body).digest('hex');
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedBody}`;
    const scope = `${date}/${service}/tc3_request`;
    const strToSign = `TC3-HMAC-SHA256\n${ts}\n${scope}\n` + crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const kDate = crypto.createHmac('sha256', 'TC3' + secret.secretKey).update(date).digest();
    const kService = crypto.createHmac('sha256', kDate).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(strToSign).digest('hex');
    const auth = `TC3-HMAC-SHA256 Credential=${secret.secretId}/${scope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`;
    const req = https.request({
      host, method: 'POST', path: '/',
      headers: {
        'Content-Type': 'application/json; charset=utf-8', Host: host,
        'X-TC-Action': action, 'X-TC-Version': version, 'X-TC-Timestamp': ts,
        'X-TC-Region': 'ap-shanghai', Authorization: auth,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try{ resolve(JSON.parse(data)); }catch(e){ resolve({ raw: data.slice(0, 300) }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function probe(service, action, data){
  const inner = Object.assign({ EnvId: 'gerenceshi-d0gguq5u39b4b86b2' }, data || {});
  const res = await tc3Call('tcb', 'tcb.tencentcloudapi.com', 'CommonServiceAPI', '2018-06-08',
    { Service: service, Action: action, ReqJson: JSON.stringify(inner) });
  const r = res.Response || {};
  if(r.Error){ console.log(`[--] ${service}.${action} -> ${r.Error.Code}: ${String(r.Error.Message).slice(0, 140)}`); }
  else { console.log(`[OK] ${service}.${action} -> ${JSON.stringify(r).slice(0, 500)}`); }
}

(async () => {
  await probe('auth', 'DescribeLoginMethods', {});
  await probe('db', 'DescribeCollections', {});
  await probe('user', 'DescribeUsers', { Limit: 1 });
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
