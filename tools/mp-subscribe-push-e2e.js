// 订阅消息推送全路径 E2E：同步一条已到期事件 → 手动触发 pushDue → 观察发送/降级
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

  // 1) 同步一条"1 分钟前到期"的一次性事件（pushDue 会尝试真实发送）
  const d = new Date(Date.now() - 60000);
  const date = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const time = p2(d.getHours()) + ':' + p2(d.getMinutes());
  const r1 = await call('syncEvent', { action: 'upsert', event: { id: 'e2e_push_test', name: '推送链路E2E', date, time, doneOn: [], weekdays: [], isBirthday: false } });
  console.log((r1 && r1.ok ? '✓' : '✗') + ' 同步到期事件 | ' + JSON.stringify(r1));

  // 2) 手动触发 pushDue
  const r2 = await call('pushDue', {});
  console.log('· pushDue 结果 | ' + JSON.stringify(r2));
  const pushPathOk = r2 && (r2.sent === 1 || r2.failed === 1);

  // 3) 清理
  const r3 = await call('syncEvent', { action: 'delete', eventId: 'e2e_push_test' });
  console.log((r3 && r3.ok ? '✓' : '✗') + ' 清理测试记录 | ' + JSON.stringify(r3));

  console.log(pushPathOk
    ? '✓ 发送路径已走通（sent=1 表示真发出；failed=1 表示无订阅额度被优雅降级——真机同意订阅后即可收到）'
    : '✗ 发送路径异常');
  process.exit(pushPathOk && r3.ok ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
