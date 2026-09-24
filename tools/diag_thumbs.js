// 查详情帖的 thumbs 存储 + feed 显示
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const share = await mini.reLaunch('/pages/share/share');
  await sleep(4000);
  const d = await share.data();
  const t = (d.list || []).find(x => (x.name || '').indexOf('多图回归') === 0);
  if (!t) { console.log('未找到多图回归帖'); await mini.disconnect(); return; }
  console.log('feed帖: name=' + (t.name || '').slice(-5) + ' photos=' + (t.photos || []).length + ' thumbs=' + (t.thumbs === undefined ? 'undefined' : (t.thumbs || []).length));
  const post = await mini.navigateTo('/pages/share/post?id=' + t._id);
  await sleep(2500);
  const pd = await post.data();
  console.log('详情帖: photos=' + ((pd.post || {}).photos || []).length + ' thumbs=' + ((pd.post || {}).thumbs === undefined ? 'undefined' : ((pd.post || {}).thumbs || []).length));
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
