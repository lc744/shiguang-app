// 读 feed dbg：诊断微信云 posts 查询
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  let logs = [];
  mini.on('console', m => { if (m && (m.type === 'error' || m.type === 'log')) logs.push('[' + m.type + '] ' + JSON.stringify(m.args || []).slice(0, 240)); });
  const share = await mini.reLaunch('/pages/share/share');
  await sleep(4500);
  const d = await share.data();
  console.log('list 长度: ' + (d.list || []).length);
  console.log('feedCity: "' + (d.feedCity || '') + '" feedType: "' + (d.feedType || '') + '" tab: ' + (d.tab || ''));
  logs.slice(-5).forEach(l => console.log('  ' + l));
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
