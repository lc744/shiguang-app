// 探测 manager-node 可用 API 面
const CloudBase = require('@cloudbase/manager-node');
const sec = require('./cloud_secrets.json');
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
(async () => {
  const app = new CloudBase({ secretId: sec.secretId, secretKey: sec.secretKey, envId: ENV, region: 'ap-shanghai' });
  console.log('app keys:', Object.keys(app).join(','));
  console.log('env keys:', app.env ? Object.keys(app.env).join(',') : 'none');
  console.log('fn keys:', app.functions ? Object.keys(app.functions).join(',') : 'none');
})().catch(e => console.error('ERR', String(e.message || e).slice(0, 200)));
