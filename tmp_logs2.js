// 用 CLS 日志服务搜 profileApi 的 adminCheck 调用记录
const CloudBase = require('@cloudbase/manager-node');
const sec = require('./cloud_secrets.json');
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
(async () => {
  const app = new CloudBase({ secretId: sec.secretId, secretKey: sec.secretKey, envId: ENV, region: 'ap-shanghai' });
  const cls = app.env.getLogService();
  const end = Date.now();
  const start = end - 6 * 3600 * 1000;
  const res = await cls.searchClsLog({
    envId: ENV,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    limit: 50,
    queryString: 'profileApi adminCheck',
  });
  const logs = (res && (res.LogResults || res.Results || res.Data || res)) || [];
  const arr = Array.isArray(logs) ? logs : (logs.Results || []);
  console.log('命中 ' + arr.length + ' 条');
  arr.slice(0, 25).forEach(l => {
    const t = l.Timestamp ? new Date(l.Timestamp).toISOString().slice(11, 19) : (l.Time || '');
    const msg = String(l.LogJson || l.Content || l.Message || '').slice(0, 200);
    console.log('--- ' + t + ' : ' + msg.replace(/\n/g, ' '));
  });
})().catch(e => console.error('ERR', String(e.message || e).slice(0, 400)));
