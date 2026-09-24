// 诊断：最新帖子 photoUrls 解析状态
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  await mini.callWxMethod('setStorageSync', 'shiguang_share_identity', { nickname: '自动化测试', avatarUrl: '', updatedAt: Date.now() });
  const page = await mini.reLaunch('/pages/share/share');
  await sleep(3500);
  const d = await page.data();
  const first = (d.list || [])[0];
  if (!first) { console.log('列表为空'); await mini.disconnect(); return; }
  console.log('最新帖: ' + (first.name || '') + ' photos=' + JSON.stringify((first.photos || []).map(s => String(s).slice(0, 60))));
  console.log('photoUrls[0] = ' + String((first.photoUrls || [])[0]).slice(0, 100));
  const u = String((first.photoUrls || [])[0]);
  if (u.indexOf('cloud://') === 0) console.log('=> 仍是 fileID：getTempFileURL 换链失败/未完成');
  else if (u.indexOf('http') === 0) console.log('=> 已换临时链接');
  else console.log('=> 异常: ' + u.slice(0, 60));
  // 试着直接对 fileID 调 getTempFileURL 看云侧返回
  try {
    const r = await mini.callWxMethod('cloud.getTempFileURL', { fileList: [String((first.photos || [])[0])] });
    console.log('getTempFileURL 直调: ' + JSON.stringify((r && r.fileList || [])[0]).slice(0, 200));
  } catch (e) { console.log('getTempFileURL 直调异常: ' + e.message); }
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
