// markFired 健康检查：到期文档 → 手动 pushDue → 读回 fired 状态
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

  const d = new Date(Date.now() - 60000);
  const date = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const time = p2(d.getHours()) + ':' + p2(d.getMinutes());
  await call('syncEvent', { action: 'upsert', event: { id: 'e2e_markfired_test', name: '标记健康检查', date, time, doneOn: [], weekdays: [], isBirthday: false } });
  console.log('到期文档已放置');

  const r = await call('pushDue', {});
  console.log('pushDue 完整结果: ' + JSON.stringify(r));

  const g = await call('syncEvent', { action: 'get', eventId: 'e2e_markfired_test' });
  console.log('文档状态: ' + JSON.stringify(g));
  if(g && g.found && g.fired){
    console.log('✓ markFired 正常（43101 后标记成功）');
  } else {
    console.log('✗ markFired 失效——文档未被标记，这就是观察不到定时器的真正原因');
  }
  await call('syncEvent', { action: 'delete', eventId: 'e2e_markfired_test' });
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
