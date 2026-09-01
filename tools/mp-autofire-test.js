// 到点自动弹提醒页 · 端到端自动化测试
// 流程：编辑页创建"下一分钟"到期的事件 → 留在首页 → 轮询断言自动跳转 remind 页 → 关闭
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');

(async () => {
  let mp;
  try{
    mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  }catch(e){ console.log('✗ 连接失败：' + e.message); process.exit(1); }
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }

  // 计算到期时间：当前时间 + 75 秒（覆盖秒数取整与轮询间隔）
  const due = new Date(Date.now() + 75 * 1000);
  const hhmm = p2(due.getHours()) + ':' + p2(due.getMinutes());
  const today = due.getFullYear() + '-' + p2(due.getMonth() + 1) + '-' + p2(due.getDate());
  console.log('目标到点时刻：今天 ' + hhmm);

  // 进编辑页
  await mp.switchTab('/pages/home/home');
  await sleep(500);
  await mp.navigateTo('/pages/editor/editor');
  await sleep(700);
  let page = await mp.currentPage();
  const nameInput = await page.$('input');
  await nameInput.input('到点自动弹窗测试');
  // 时间选择器（日期默认今天）：按 label 文本认准"时间"那个 picker
  const pickers = await page.$$('picker');
  let timeSet = false;
  for(const pk of pickers){
    let label = '';
    try{ const lbl = await pk.$('.meta-label'); label = lbl ? await lbl.text() : ''; }catch(e){}
    if(/时间/.test(label)){
      await pk.trigger('change', { value: hhmm });
      timeSet = true;
      break;
    }
  }
  console.log(timeSet ? '✓ 时间选择器已设为 ' + hhmm : '✗ 没找到时间 picker');
  await sleep(300);
  // 校验表单里时间确实变了
  const fd = await page.data('form');
  if(!timeSet || fd.time !== hhmm){ console.log('✗ form.time=' + fd.time + '，未生效，中止'); process.exit(1); }
  console.log('✓ form.time=' + fd.time);
  await sleep(300);
  await (await page.$('.action-row .primary')).tap();
  await sleep(1000);
  page = await mp.currentPage();
  console.log('保存后页面：' + page.path);
  if(page.path !== 'pages/home/home'){ console.log('✗ 未返回首页'); process.exit(1); }

  // 轮询等待自动跳转（最多 100 秒）
  let fired = false;
  for(let i = 0; i < 34; i++){
    await sleep(3000);
    page = await mp.currentPage();
    if(page.path === 'pages/remind/remind'){ fired = true; break; }
  }
  if(fired){
    const rn = await page.$('.r-name');
    console.log('✓✓ 到点自动弹出提醒页！事件名：' + (rn ? await rn.text() : '?'));
    const btn = await page.$('.action-row .primary');
    await btn.tap();
    await sleep(600);
    console.log('✓ 已关闭提醒页');
    process.exit(0);
  } else {
    console.log('✗ 100 秒内未自动弹出提醒页');
    process.exit(1);
  }
})();
