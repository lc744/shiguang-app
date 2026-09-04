// 布局几何测量：FAB / 年月弹层 / 弹层内按钮 的真实尺寸与位置
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = async el => {
  if(!el) return '(null)';
  const s = await el.size(); const o = await el.offset();
  return `size=${s.width}x${s.height} offset=(${o.left},${o.top})`;
};

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }
  const sys = await mp.systemInfo();
  console.log(`视口: ${sys.windowWidth}x${sys.windowHeight}\n`);

  // 1) 首页 FAB
  await mp.reLaunch('/pages/home/home'); await sleep(900);
  let page = await mp.currentPage();
  let fab = await page.$('.fab');
  console.log('首页 .fab → ' + await fmt(fab));
  await mp.screenshot({ path: 'shot-fab.png' });

  // 2) 日历年月弹层
  await mp.switchTab('/pages/calendar/calendar'); await sleep(900);
  page = await mp.currentPage();
  const title = await page.$('.month-title');
  await title.tap(); await sleep(700);
  console.log('弹层 .remind-fullscreen → ' + await fmt(await page.$('.remind-fullscreen')));
  console.log('弹层 .remind-card → ' + await fmt(await page.$('.remind-card')));
  const btns = await page.$$('.yp-btn');
  for(let i = 0; i < btns.length; i++) console.log('  .yp-btn[' + i + '] → ' + await fmt(btns[i]));
  const months = await page.$$('.yp-month');
  if(months.length) console.log('  .yp-month[0] → ' + await fmt(months[0]));
  console.log('  .yp-months 容器 → ' + await fmt(await page.$('.yp-months')));
  const acts = await page.$$('.action-row button, .action-row .primary, .action-row .secondary');
  for(let i = 0; i < Math.min(acts.length, 2); i++) console.log('  action-row 按钮[' + i + '] → ' + await fmt(acts[i]));
  await mp.screenshot({ path: 'shot-picker.png' });

  // 3) 关掉弹层
  const cancel = await page.$('.action-row .secondary');
  if(cancel){ await cancel.tap(); await sleep(400); }

  // 4) 首页 icon-btn（头部图标钮）
  await mp.switchTab('/pages/home/home'); await sleep(800);
  page = await mp.currentPage();
  const icon = await page.$('.icon-btn');
  console.log('首页 .icon-btn → ' + await fmt(icon));

  // 5) 设置页备份行
  await mp.switchTab('/pages/settings/settings'); await sleep(800);
  page = await mp.currentPage();
  const items = await page.$$('.backup-item');
  console.log('备份行数量: ' + items.length);
  if(items.length){
    const info = await items[0].$('.backup-info');
    const acts = await items[0].$$('.backup-actions button');
    console.log('  .backup-info → ' + await fmt(info));
    for(let i = 0; i < acts.length; i++) console.log('  恢复/删除按钮[' + i + '] → ' + await fmt(acts[i]));
    await mp.screenshot({ path: 'shot-backup.png' });
  }

  // 6) 编辑页 add-emoji
  await mp.navigateTo('/pages/editor/editor'); await sleep(700);
  page = await mp.currentPage();
  const ae = await page.$('.add-emoji');
  if(ae) console.log('编辑页 .add-emoji → ' + await fmt(ae));
  try{ const bk = await page.$('.action-row .secondary'); if(bk){ await bk.tap(); await sleep(300); } }catch(e){}
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
