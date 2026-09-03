// 预告页（upcoming）· 补充冒烟测试
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }
  await mp.callWxMethod('setStorageSync', 'shiguang_events_v2', '[]');
  await mp.reLaunch('/pages/upcoming/upcoming');
  await sleep(900);
  let page = await mp.currentPage();
  console.log((page.path === 'pages/upcoming/upcoming' ? '✓' : '✗') + ' 预告页路径 | ' + page.path);

  // 建一个 7 天后的事件 + 一个明天的事件，回预告页验证分组
  const p2 = n => String(n).padStart(2, '0');
  const mk = days => {
    const d = new Date(Date.now() + days * 86400000);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  };
  await mp.navigateTo('/pages/editor/editor');
  await sleep(700);
  page = await mp.currentPage();
  await (await page.$('input')).input('明天要做的事');
  const pickers = await page.$$('picker');
  for(const pk of pickers){
    let label = '';
    try{ const lbl = await pk.$('.meta-label'); label = lbl ? await lbl.text() : ''; }catch(e){}
    if(/日期/.test(label)){ await pk.trigger('change', { value: mk(1) }); break; }
  }
  await sleep(200);
  await (await page.$('.action-row .primary')).tap();
  await sleep(900);
  await mp.navigateTo('/pages/editor/editor');
  await sleep(700);
  page = await mp.currentPage();
  await (await page.$('input')).input('下周要做的事');
  const pickers2 = await page.$$('picker');
  for(const pk of pickers2){
    let label = '';
    try{ const lbl = await pk.$('.meta-label'); label = lbl ? await lbl.text() : ''; }catch(e){}
    if(/日期/.test(label)){ await pk.trigger('change', { value: mk(7) }); break; }
  }
  await sleep(200);
  await (await page.$('.action-row .primary')).tap();
  await sleep(900);

  await mp.switchTab('/pages/upcoming/upcoming');
  await sleep(800);
  page = await mp.currentPage();
  const data = await page.data();
  const raw = JSON.stringify(data);
  const hasTmr = raw.indexOf('明天要做的事') >= 0;
  const hasNext = raw.indexOf('下周要做的事') >= 0;
  console.log((hasTmr ? '✓' : '✗') + ' 明天事件出现在预告');
  console.log((hasNext ? '✓' : '✗') + ' 7 天后事件出现在预告');
  // 有分组标题？
  const groups = await page.$$('.group-title, .section-title, .up-group');
  console.log((groups.length ? '✓' : '△') + ' 分组标题元素 ' + groups.length + ' 个（0 不一定是问题）');
  process.exit(hasTmr && hasNext ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
