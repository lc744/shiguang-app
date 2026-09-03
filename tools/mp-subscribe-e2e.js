// 订阅消息云函数 E2E：syncEvent upsert/delete + pushDue 手动触发
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }
  const call = (name, data) => mp.evaluate(new Function(
    'return new Promise((res, rej) => wx.cloud.callFunction({ name: ' + JSON.stringify(name) +
    ', data: ' + JSON.stringify(data) + ' }).then(r => res(r.result)).catch(e => rej(String(e && e.message || e))));'
  ));

  // 1) upsert 一个"一分钟后到期"的一次性事件
  const d = new Date(Date.now() + 60000);
  const date = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const time = p2(d.getHours()) + ':' + p2(d.getMinutes());
  const r1 = await call('syncEvent', { action: 'upsert', event: { id: 'e2e_sync_test', name: 'E2E推送测试', date, time, doneOn: [], weekdays: [], isBirthday: false } });
  console.log((r1 && r1.ok ? '✓' : '✗') + ' syncEvent upsert | ' + JSON.stringify(r1));

  // 2) 手动触发 pushDue（模板未配置 → 应返回 skipped 提示，证明函数部署正常 + 集合已建）
  const r2 = await call('pushDue', {});
  console.log('· pushDue | ' + JSON.stringify(r2));

  // 3) 删除测试记录
  const r3 = await call('syncEvent', { action: 'delete', eventId: 'e2e_sync_test' });
  console.log((r3 && r3.ok ? '✓' : '✗') + ' syncEvent delete | ' + JSON.stringify(r3));

  process.exit(r1 && r1.ok && r3 && r3.ok ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
