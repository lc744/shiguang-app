// 反复触发迁移直到稳定（服务端幂等；前端3s超时不影响服务端继续执行）
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const share = await mini.reLaunch('/pages/share/share');
  await sleep(4000);
  for (let round = 1; round <= 5; round++) {
    const r = await share.callMethod('__migrate').catch(e => ({ ok: false, error: e.message }));
    const rr = (r && r.result !== undefined) ? r.result : r;
    console.log('轮次' + round + ': ' + JSON.stringify(rr).slice(0, 200));
    if (rr && rr.ok && rr.migrated === 0) { console.log('迁移完成'); break; }
    await sleep(2500);
  }
  // 验证 feed
  await mini.reLaunch('/pages/share/share');
  await sleep(4000);
  const d = await mini.currentPage().data ? await (await mini.currentPage()).data() : null;
  const page = await mini.currentPage();
  const dd = await page.data();
  console.log('feed list: ' + (dd.list || []).length + ' 条, 首帖 photos=' + (((dd.list || [])[0] || {}).photos || []).length);
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
