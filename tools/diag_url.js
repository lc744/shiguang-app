const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const page = await mini.reLaunch('/pages/share/share');
  await sleep(4000);
  const d = await page.data();
  const p = (d.list || [])[0];
  console.log('URL=' + (p.photoUrls || [])[0]);
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });