// 深度诊断：精灵滚底可视性 + 无图发布默认图链路 + 多图发布
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });

  // ---- A. 精灵：20 条消息后，最后一条是否在面板可视区 ----
  let page = await mini.reLaunch('/pages/home/home');
  await sleep(2000);
  const genie = await page.$('genie');
  const many = [];
  for (let i = 1; i <= 20; i++) many.push({ id: 'gb' + i, role: i % 2 ? 'user' : 'ai', text: '消息' + i + '：' + '长内容测试滚动'.repeat(4) });
  await genie.setData({ open: true, showfab: false, bubbles: many });
  await sleep(1000);
  await genie.callMethod('scrollToBottom');
  await sleep(1500);
  const wrap = await genie.$('.genie-bubbles');
  const wrapOff = await wrap.offset();
  const wrapSize = await wrap.size();
  const b20 = await genie.$('#gb20');
  const b20Off = await b20.offset();
  const b20Size = await b20.size();
  const bTop = b20Off.top, bBottom = b20Off.top + b20Size.height;
  const wTop = wrapOff.top, wBottom = wrapOff.top + wrapSize.height;
  console.log('[精灵] 面板滚动区: top=' + Math.round(wTop) + ' bottom=' + Math.round(wBottom) + ' 高=' + Math.round(wrapSize.height));
  console.log('[精灵] 第20条消息: top=' + Math.round(bTop) + ' bottom=' + Math.round(bBottom));
  console.log('[精灵] 第20条是否在可视区: ' + (bTop >= wTop - 5 && bBottom <= wBottom + 5 ? '是(已贴底)' : '否——滚动未生效!'));
  // 手势模拟上滑（从滚动区中部向上滑 250px），区分"滚动区死了"还是"API 无效"
  const cx = wrapOff.left + wrapSize.width / 2;
  const cy = wrapOff.top + wrapSize.height / 2;
  await wrap.touchstart({ touches: [{ x: cx, y: cy }], changedTouches: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 5; i++) {
    await wrap.touchmove({ touches: [{ x: cx, y: cy - i * 50 }], changedTouches: [{ x: cx, y: cy - i * 50 }] });
    await sleep(40);
  }
  await wrap.touchend({ touches: [], changedTouches: [{ x: cx, y: cy - 250 }] });
  await sleep(800);
  const b20b = await genie.$('#gb20');
  const b20bOff = await b20b.offset();
  console.log('[精灵] 手势上滑后第20条 top=' + Math.round(b20bOff.top) + '（变化=滚动区活着，API 问题；不变=scroll-view 死）');
  // 面板整体（inputbar 上方应贴着 b20 底）
  const inputbar = await genie.$('.genie-inputbar');
  const ibOff = await inputbar.offset();
  console.log('[精灵] 输入条 top=' + Math.round(ibOff.top) + '（第20条 bottom 应接近它）');
  await genie.setData({ open: false });
  await sleep(400);

  // ---- B. 无图发布：填表单后走完整 doPublish，验证帖子带默认图 ----
  await mini.callWxMethod('setStorageSync', 'shiguang_share_identity', { nickname: '自动化测试', avatarUrl: '', updatedAt: Date.now() });
  page = await mini.navigateTo('/pages/share/publish');
  await sleep(1800);
  const pd0 = await page.data();
  console.log('[发布] 表单态: hasProfile=' + pd0.hasProfile + ' photos=' + pd0.photos.length + ' type=' + pd0.type);
  // 默认图解析验证（不依赖表单）
  try {
    const def = await page.callMethod('_ensureDefaultPhoto', pd0.type || '美食');
    console.log('[发布] 默认图解析: ' + (String(def).indexOf('cloud://') === 0 ? 'OK ' + String(def).slice(0, 50) : '失败 ' + def));
  } catch (e) { console.log('[发布] 默认图解析异常: ' + e.message); }
  if (pd0.hasProfile) {
    await page.setData({ city: '苏州市', addr: '自动化测试地址', name: '滚底诊断帖' });
    await page.callMethod('doPublish').catch(() => {});
    // doPublish 成功会 navigateBack 销毁页面，忽略后续取数
    await sleep(10000);
  }
  await mini.reLaunch('/pages/share/share');
  await sleep(2500);

  // ---- C. 查大众推荐第一条是否带图 ----
  page = await mini.reLaunch('/pages/share/share');
  await sleep(2500);
  const sd = await page.data();
  const first = (sd.list || [])[0];
  if (first) console.log('[验证] 最新帖子: fromApp=' + !!first.fromApp + ' photos=' + (first.photos || []).length + ' name=' + (first.name || first.desc || '').slice(0, 20));

  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('诊断失败:', e.message); process.exit(1); });
