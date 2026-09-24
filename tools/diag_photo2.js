const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  await mini.callWxMethod('setStorageSync', 'shiguang_share_identity', { nickname: '自动化测试', avatarUrl: '', updatedAt: Date.now() });
  const page = await mini.reLaunch('/pages/share/share');
  await sleep(4000);
  const d = await page.data();
  (d.list || []).slice(0, 6).forEach(p => {
    const u = String((p.photoUrls || [])[0] || '');
    console.log((p.name || '').slice(0, 16) + ' | fromApp=' + !!p.fromApp + ' | ' + u.slice(0, 72));
  });
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });