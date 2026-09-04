// 「我的」页 UI 流程：退出残留登录态 → 微信一键登录 → 填昵称保存 → 展示态 → 发布页身份联动
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ID_KEY = 'shiguang_share_identity';

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){ try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); } }
  await mp.mockWxMethod('showModal', { confirm: true });
  await mp.reLaunch('/pages/me/me');
  await sleep(1500);
  let page = await mp.currentPage();
  let d = await page.data();
  console.log('初始态: loggedIn=' + d.loggedIn + ' editing=' + d.editing);

  // 清掉残留登录态
  if(d.loggedIn || d.editing){
    await mp.evaluate(new Function('try{ wx.removeStorageSync(' + JSON.stringify(ID_KEY) + '); }catch(e){} return "ok";'));
    page = await mp.currentPage();
    await page.callMethod('onShow');
    await sleep(800);
    d = await page.data();
    console.log('清残留后: loggedIn=' + d.loggedIn);
  }

  // 1) 未登录 hero
  const hero = await page.$('.me-hero');
  if(!hero){ console.log('✗ 未登录卡片未显示'); process.exit(1); }
  console.log('✓ 未登录态展示');

  // 2) 微信一键登录 → 编辑面板
  const loginBtn = await page.$('.me-login-btn');
  await loginBtn.tap();
  await sleep(1200);
  page = await mp.currentPage();
  d = await page.data();
  if(!d.editing){ console.log('✗ 登录后未进入编辑态'); process.exit(1); }
  console.log('✓ 一键登录进入资料编辑');

  // 3) 填昵称 + 保存
  const nick = await page.$('.me-nick-input');
  await nick.input('E2E用户' + (Date.now() % 100));
  await sleep(400);
  const saveBtn = await page.$('.me-btn.primary');
  await saveBtn.tap();
  await sleep(2500);
  page = await mp.currentPage();
  d = await page.data();
  const stored = await mp.evaluate(new Function('return wx.getStorageSync(' + JSON.stringify(ID_KEY) + ');'));
  console.log('保存后: loggedIn=' + d.loggedIn + ' nickname=' + d.nickname + ' 本地=' + JSON.stringify(stored.nickname || ''));
  if(!d.loggedIn || !d.nickname || !stored.nickname){ console.log('✗ 资料保存失败'); process.exit(1); }
  console.log('✓ 登录+资料保存');

  // 4) 发布页身份联动
  await mp.navigateTo('/pages/share/publish');
  await sleep(1200);
  page = await mp.currentPage();
  d = await page.data();
  console.log('发布页身份: hasProfile=' + d.hasProfile + ' nickname=' + d.nickname);
  const ok = d.hasProfile && d.nickname;
  console.log(ok ? '\n✓✓ 我的页登录流程通过' : '\n✗ 联动失败');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
