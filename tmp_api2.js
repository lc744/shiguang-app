// 用 scfService 的 CLS 日志搜索
const CloudBase = require('@cloudbase/manager-node');
const sec = require('./cloud_secrets.json');
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
(async () => {
  const app = new CloudBase({ secretId: sec.secretId, secretKey: sec.secretKey, envId: ENV, region: 'ap-shanghai' });
  const scf = app.functions.scfService;
  console.log('scfService keys:', Object.keys(scf).join(','));
})().catch(e => console.error('ERR', String(e.message || e).slice(0, 200)));
