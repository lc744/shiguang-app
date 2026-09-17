// 拉取 profileApi 云函数最近日志，找 adminCheck 调用
const CloudBase = require('@cloudbase/manager-node');
const sec = require('./cloud_secrets.json');
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
(async () => {
  const app = new CloudBase({ secretId: sec.secretId, secretKey: sec.secretKey, envId: ENV, region: 'ap-shanghai' });
  const res = await app.functions.getFunctionLogs({
    functionName: 'profileApi',
    limit: 30,
    order: 'desc',
    offset: 0,
  });
  const logs = (res && res.Data) || [];
  console.log('最近调用 ' + logs.length + ' 条:');
  logs.forEach(l => {
    const t = l.StartTime || l.time || '';
    const ret = String(l.RetMsg || '').slice(0, 160);
    const bill = l.BillDuration || '';
    console.log('--- ' + t + ' (' + bill + 'ms)');
    console.log('    ' + ret.replace(/\n/g, ' | '));
  });
})().catch(e => console.error('ERR', String(e.message || e).slice(0, 300)));
