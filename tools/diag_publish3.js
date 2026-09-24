// 实测 3 张图发布（用户报错场景）+ 捕获 publish-result 日志
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  let logs = [];
  mini.on('console', m => { if (m && (m.type === 'error' || m.type === 'log')) logs.push('[' + m.type + '] ' + JSON.stringify(m.args || []).slice(0, 220)); });
  await mini.callWxMethod('setStorageSync', 'shiguang_share_identity', { nickname: '自动化测试', avatarUrl: '', updatedAt: Date.now() });
  const page = await mini.reLaunch('/pages/share/publish');
  await sleep(2200);
  await page.setData({ city: '苏州市', addr: '多图回归地址', name: '多图回归' + Date.now() % 100000, photos: ['/images/defaults/food.jpg', '/images/defaults/scene.jpg', '/images/defaults/fun.jpg'], thumbs: ['/images/defaults/food.jpg', '/images/defaults/scene.jpg', '/images/defaults/fun.jpg'] });
  const t0 = Date.now();
  await page.callMethod('doPublish').catch(e => console.log('[异常] ' + e.message));
  await sleep(15000);
  console.log('[耗时标记] ' + Math.round((Date.now() - t0) / 1000) + 's');
  logs.forEach(l => console.log('  ' + l));
  const share = await mini.reLaunch('/pages/share/share');
  await sleep(4000);
  console.log('== share 页加载后日志 ==');
  logs.slice(-6).forEach(l => console.log('  ' + l));
  const d = await share.data();
  console.log('[feed前5帖] ' + (d.list || []).slice(0, 5).map(x => (x.name || '无名') + '|' + (x.city || '')).join(' / '));
  console.log('[feedCity] ' + (d.feedCity || '空') + ' feedType=' + (d.feedType || '空'));
  const mine = (d.list || []).filter(x => (x.name || '').indexOf('多图回归') === 0);
  if (!mine.length) { console.log('[结果] 未找到帖子'); await mini.disconnect(); return; }
  console.log('[结果] 发布成功 photos=' + (mine[0].photos || []).length);
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
