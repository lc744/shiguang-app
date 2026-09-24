// 验证详情页 swiper 图片实际渲染尺寸（排除 0x0 塌缩）
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const share = await mini.reLaunch('/pages/share/share');
  await sleep(4000);
  const d = await share.data();
  const t = (d.list || []).find(x => (x.name || '').indexOf('多图回归') === 0 && (x.photos || []).length >= 3);
  if (!t) { console.log('未找到3图测试帖'); await mini.disconnect(); return; }
  const post = await mini.navigateTo('/pages/share/post?id=' + t._id);
  await sleep(3000);
  const box = await post.$('.post-img-box');
  const img = await post.$('.post-img-fit');
  if (!box || !img) { console.log('元素未找到'); await mini.disconnect(); return; }
  const bs = await box.size(), is = await img.size();
  console.log('容器: ' + Math.round(bs.width) + 'x' + Math.round(bs.height));
  console.log('image: ' + Math.round(is.width) + 'x' + Math.round(is.height) + (is.width > 100 ? '  <- 正常渲染' : '  <- 塌缩!'));
  await mini.disconnect();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
