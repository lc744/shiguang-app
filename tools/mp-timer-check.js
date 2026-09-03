// 被动检测定时触发器是否存在：放一条到期事件 → 等 75 秒 → 手动查 fired 状态
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

  // 1) 同步一条"2 分钟前到期"的一次性事件
  const d = new Date(Date.now() - 120000);
  const date = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const time = p2(d.getHours()) + ':' + p2(d.getMinutes());
  const r1 = await call('syncEvent', { action: 'upsert', event: { id: 'e2e_timer_test', name: '定时器被动检测', date, time, doneOn: [], weekdays: [], isBirthday: false } });
  console.log('upsert: ' + JSON.stringify(r1));

  // 2) 等 75 秒（定时器每分钟一跑，足够覆盖一个完整周期）
  console.log('等待 75 秒让定时器（若存在）跑完一个周期…');
  await sleep(75000);

  // 3) 手动调 pushDue：若定时器已处理，total=0（fired 已被定时器标记）；若 total=1，说明没有任何定时器在跑
  const r2 = await call('pushDue', {});
  console.log('手动 pushDue: ' + JSON.stringify(r2));
  if(r2 && r2.total === 0){
    console.log('✓ 定时触发器存在且在工作（文档已被自动标记 fired）');
  } else if(r2 && r2.total >= 1){
    console.log('✗ 没有定时器在跑——需要在开发者工具上传触发器');
  }

  // 4) 清理
  await call('syncEvent', { action: 'delete', eventId: 'e2e_timer_test' });
  console.log('清理完成');
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
