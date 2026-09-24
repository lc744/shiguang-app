// 验证 posts_full 高清图链路：带图发布 → 看 fullErr → fullPhoto 拉原图
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  let consoleErrs = [];
  let consoleLogs = [];
  mini.on('console', m => { if (m && m.type === 'error') consoleErrs.push(JSON.stringify(m.args || []).slice(0, 220)); if (m && m.type === 'log') consoleLogs.push(JSON.stringify(m.args || []).slice(0, 160)); });
  await mini.callWxMethod('setStorageSync', 'shiguang_share_identity', { nickname: '自动化测试', avatarUrl: '', updatedAt: Date.now() });
  const page = await mini.reLaunch('/pages/share/publish');
  await sleep(2000);
  // 包内实拍图（automator 工具端可上传）
  await page.setData({ city: '苏州市', addr: '高清验证地址', name: '高清验证帖' + Date.now() % 100000, photos: ['/images/defaults/food.jpg'], fullPhotos: ['/images/defaults/food.jpg'] });
  try {
    await page.callMethod('doPublish');
    console.log('doPublish 调用完成');
  } catch (e) { console.log('doPublish异常: ' + e.message); }
  await sleep(15000);
  // 查最新帖拿 id
  const share = await mini.reLaunch('/pages/share/share');
  await sleep(3500);
  const d = await share.data();
  console.log('feed 最新 3 帖: ' + (d.list || []).slice(0, 3).map(x => (x.name || '无名')).join(' / '));
  const t = (d.list || []).find(x => (x.name || '').indexOf('高清验证帖') === 0);
  if (!t) { console.log('未找到验证帖'); await mini.disconnect(); return; }
  console.log('帖子 id=' + t._id + ' photos=' + (t.photos || []).length);
  // 模拟点击第 0 张图触发 fullPhoto
  await share.callMethod('onImageTap', { currentTarget: { dataset: { pid: t._id, idx: 0, urls: (t.photoUrls || [])[0] ? [t.photoUrls[0]] : [], current: (t.photoUrls || [])[0] } } });
  await sleep(4000);
  console.log('console日志: ' + (consoleErrs.concat(consoleLogs).join(' | ') || '无'));
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
