// 详情页流程补充测试 v2：轮询式页面等待 + 唯一命名事件
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }
  await mp.reLaunch('/pages/home/home');
  await sleep(800);

  // 建一个唯一命名的事件
  const NAME = '详情流程' + Date.now() % 100000;
  await mp.navigateTo('/pages/editor/editor');
  await sleep(700);
  let page = await mp.currentPage();
  await (await page.$('input')).input(NAME);
  await (await page.$('.action-row .primary')).tap();
  await sleep(900);

  // 回首页后列表点该事件 → 轮询等详情页（最多 6 秒）
  page = await mp.currentPage();
  const items = await page.$$('.event');
  let tapped = false;
  for(const it of items){
    const nm = await it.$('.eb-name');
    if(nm && (await nm.text()) === NAME){ await it.tap(); tapped = true; break; }
  }
  if(!tapped){ console.log('✗ 列表里没找到刚建的事件'); process.exit(1); }
  let onDetail = false;
  for(let i = 0; i < 12; i++){
    await sleep(500);
    page = await mp.currentPage();
    if(page.path === 'pages/detail/detail'){ onDetail = true; break; }
  }
  console.log((onDetail ? '✓' : '✗') + ' 进入详情页');
  if(!onDetail) process.exit(1);

  // 详情页显示事件名？
  const data = await page.data();
  const showsName = JSON.stringify(data).indexOf(NAME) >= 0;
  console.log((showsName ? '✓' : '✗') + ' 详情页数据含事件名');

  // 删除（wx.showModal 确认框 → automator 可用 page.waitFor/modal 处理：模拟器里 showModal 可被自动化确认）
  await (await page.$('.danger-btn')).tap();
  await sleep(600);
  // showModal 的确认：automator 提供 mp.handleModal? 若无 API，改用 mock：提前注入 wx.showModal 补丁
  // 这里直接再读存储判断（若还有确认框挡着，删除未发生 → 报告）
  const raw = await mp.callWxMethod('getStorageSync', 'shiguang_events_v2');
  let evs = typeof raw === 'string' ? JSON.parse(raw) : raw;
  let gone = !(evs || []).some(e => e.name === NAME);
  if(!gone){
    console.log('△ 删除被 showModal 确认框拦截（预期行为），尝试自动化确认…');
    // miniprogram-automator: mp.handleModal 可处理原生 modal（部分版本支持 mock modal）
    try{
      await mp.mockWxMethod('showModal', { confirm: true, cancel: false });
      await (await page.$('.danger-btn')).tap();
      await sleep(900);
      const raw2 = await mp.callWxMethod('getStorageSync', 'shiguang_events_v2');
      evs = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2;
      gone = !(evs || []).some(e => e.name === NAME);
    }catch(e){ console.log('  mock 失败：' + e.message); }
  }
  console.log((gone ? '✓' : '✗') + ' 事件已删除');
  page = await mp.currentPage();
  console.log((page.path === 'pages/home/home' ? '✓' : '△') + ' 最终页面 | ' + page.path);
  process.exit(gone ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
