// 纯观察实验：放置到期文档后 3 分钟内只读轮询 fired 状态，绝不手动调 pushDue
// 若 fired 在无人工干预下变 true → 定时器存在；3 分钟不变 → 定时器不存在
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

  // 1) 同步一条"90 秒前到期"的一次性事件
  const d = new Date(Date.now() - 90000);
  const date = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const time = p2(d.getHours()) + ':' + p2(d.getMinutes());
  await call('syncEvent', { action: 'upsert', event: { id: 'e2e_watch_test', name: '纯观察实验', date, time, doneOn: [], weekdays: [], isBirthday: false } });
  console.log('已放置到期文档（90秒前到期），开始 3 分钟纯观察…');

  // 2) 每 20 秒只读查询，共 9 次
  let firedSeen = false;
  for(let i = 1; i <= 9; i++){
    await sleep(20000);
    const g = await call('syncEvent', { action: 'get', eventId: 'e2e_watch_test' });
    const line = (i * 20) + 's: fired=' + (g && g.found ? g.fired : '??');
    console.log(line);
    if(g && g.found && g.fired){ firedSeen = true; break; }
  }

  // 3) 清理
  await call('syncEvent', { action: 'delete', eventId: 'e2e_watch_test' });
  console.log(firedSeen ? '✓✓ 定时器确认存在并在工作' : '✗ 3 分钟内无任何自动处理 → 定时器不存在（收到的那条消息应来自手动运行）');
  process.exit(firedSeen ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
