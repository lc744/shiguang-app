// 一次性：把三张默认图上传到微信云存储，输出 fileID（写入 postApi 后端兜底用）
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const page = await mini.reLaunch('/pages/share/publish');
  await sleep(2000);
  for (const n of ['food', 'scene', 'fun']) {
    const fid = await page.callMethod('_upload', '/images/defaults/' + n + '.jpg', 'defaults');
    console.log(n + ' = \'' + fid + '\',');
  }
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
