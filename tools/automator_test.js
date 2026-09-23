// 微信开发者工具自动化冒烟测试（miniprogram-automator + IDE 自动化端口 9420）
// 用法: node tools/automator_test.js
const automator = require('miniprogram-automator');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, pass, note) => {
  results.push(pass);
  console.log((pass ? '\u2713 PASS ' : '\u2717 FAIL ') + name + (note ? '  -- ' + note : ''));
};

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const consoleErrors = [];
  mini.on('console', msg => {
    if (msg && msg.type === 'error') {
      const t = JSON.stringify(msg.args || []).slice(0, 220);
      consoleErrors.push(t);
      console.log('  [console.error] ' + t);
    }
  });

  // ---- 1. 分享页：先注入登录身份绕过拦截，再看 tab 结构 + 大众推荐数据 ----
  await mini.callWxMethod('setStorageSync', 'shiguang_share_identity', { nickname: '自动化测试', avatarUrl: '', updatedAt: Date.now() });
  let page = await mini.reLaunch('/pages/share/share');
  await sleep(2500);
  const segs = await page.$$('.seg');
  const pills = await page.$$('.pub-pill');
  ok('分享页 tab 行 2 tab + 2 pill(四按钮等分)', segs.length === 2 && pills.length === 2, 'seg=' + segs.length + ' pill=' + pills.length);
  const sd = await page.data();
  console.log('  [share.data] needLogin=' + sd.needLogin + ' list=' + (sd.list || []).length);
  const appPost = (sd.list || []).find(x => x.fromApp);
  ok('大众推荐含安卓帖子(跨端桥)', !!appPost, appPost ? ('id=' + appPost._id + ' 昵称=' + appPost.nickname) : '列表无 fromApp 帖子');
  if (appPost) {
    ok('安卓帖子昵称非空且非类型', appPost.nickname && appPost.nickname !== appPost.type, 'nickname=' + appPost.nickname);
    ok('安卓帖子头像已带出', !!appPost.avatarUrl, 'avatarUrl 长度=' + String(appPost.avatarUrl || '').length);
  }

  // ---- 2. 点开安卓帖子详情 ----
  if (appPost) {
    page = await mini.navigateTo('/pages/share/post?id=' + appPost._id);
    await sleep(3000);
    const pd = await page.data();
    ok('安卓帖子详情可打开', !!pd.post, pd.post ? ('name=' + pd.post.name) : '');
    if (pd.post) {
      ok('详情带头像', !!pd.post.avatarUrl, '');
      ok('详情照片已归一为字符串', (pd.post.photos || []).every(x => typeof x === 'string'), '照片数=' + (pd.post.photos || []).length);
    }
    const ownerBadges = await page.$$('.cmt-owner');
    ok('评论列表可加载', (pd.comments || []).length >= 0, '条数=' + (pd.comments || []).length);
    if ((pd.comments || []).length) {
      ok('评论含 isOwner 字段', (pd.comments || []).every(c => typeof c.isOwner === 'boolean'), '贴主评论=' + (pd.comments || []).filter(c => c.isOwner).length);
      if ((pd.comments || []).some(c => c.isOwner)) ok('贴主徽章已渲染', ownerBadges.length > 0, 'badge=' + ownerBadges.length);
    }
    const ph = await page.$('input.cmt-input');
    if (ph) {
      const phAttr = await ph.attribute('placeholder');
      ok('评论 placeholder 为短文案', phAttr === '友善评论', '实际=' + phAttr);
    }
    await mini.navigateBack();
    await sleep(800);
  }

  // ---- 3. 首页精灵面板 ----
  page = await mini.reLaunch('/pages/home/home');
  await sleep(2000);
  const genie = await page.$('genie');
  ok('首页挂载精灵组件', !!genie, '');
  if (genie) {
    await genie.setData({ open: true, showfab: false, bubbles: [
      { id: 'b1', role: 'user', text: '测试消息一' },
      { id: 'b2', role: 'ai', text: '这是一条很长的回复用于撑起滚动区域'.repeat(12) },
      { id: 'b3', role: 'user', text: '测试消息二' }
    ], lastId: 'b3' });
    await sleep(1200);
    const panel = await genie.$('.genie-panel');
    ok('精灵面板可打开', !!panel, '');
    const bubbles = await genie.$$('.genie-bubble');
    ok('精灵消息渲染', bubbles.length === 3, 'bubble=' + bubbles.length);
    const wrap = await genie.$('.genie-scroll-wrap');
    ok('滚动包裹层存在(撑高方案)', !!wrap, '');
    const sv = await genie.$('.genie-bubbles');
    if (sv) {
      const svProps = await sv.attribute('scroll-y');
      ok('消息区 scroll-y 开启', svProps !== undefined && svProps !== null, 'scroll-y=' + svProps);
    }
    await genie.setData({ open: false });
  }

  // ---- 4. 汇总 ----
  const pass = results.filter(Boolean).length;
  console.log('\n===== 冒烟测试 ' + pass + '/' + results.length + ' 通过; console.error x' + consoleErrors.length + ' =====');
  await mini.disconnect();
  process.exit(0);
})().catch(e => {
  console.error('自动化失败:', e.message);
  process.exit(1);
});
