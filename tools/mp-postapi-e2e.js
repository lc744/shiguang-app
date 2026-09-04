// postApi 全周期 E2E：发布(含内容安全) → 信息流 → 点赞切换 → 详情 → 我的 → 举报去重 → 删除
const automator = require('miniprogram-automator');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }
  const call = (name, data) => mp.evaluate(new Function(
    'return new Promise((res, rej) => wx.cloud.callFunction({ name: ' + JSON.stringify(name) +
    ', data: ' + JSON.stringify(data) + ' }).then(r => res(r.result)).catch(e => rej(String(e && e.message || e))));'
  ));

  // 0) 生成测试图并上传云存储
  const b64 = fs.readFileSync(__dirname + '/test-image-b64.txt', 'utf8').trim();
  const fileId = await mp.evaluate(new Function(
    'return new Promise((res, rej) => {' +
    ' const b64 = ' + JSON.stringify(b64) + ';' +
    ' const p = wx.env.USER_DATA_PATH + "/e2e_post.jpg";' +
    ' try{ wx.getFileSystemManager().writeFileSync(p, b64, "base64"); }catch(e){ res("WRITE_FAIL:" + e.message); return; }' +
    ' wx.cloud.uploadFile({ cloudPath: "e2e/test_" + Date.now() + ".jpg", filePath: p })' +
    '  .then(r => res(r.fileID)).catch(e => rej(String(e.errMsg || e.message))); });'
  ));
  if(!/^cloud:\/\//.test(fileId)){ console.log('✗ 云存储上传失败: ' + fileId); process.exit(1); }
  console.log('✓ 测试图已上云: ' + fileId);

  // 1) 发布（触发 msgSecCheck + imgSecCheck）
  const pub = await call('postApi', { action: 'publish', post: {
    nickname: 'E2E测试员', avatarUrl: '', type: '餐厅',
    name: 'E2E打卡测试店' + (Date.now() % 1000), desc: '自动化测试发布，味道不错',
    photos: [fileId]
  }});
  console.log((pub && pub.ok ? '✓' : '✗') + ' 发布（含内容安全检测） | ' + JSON.stringify(pub).slice(0, 160));
  if(!pub || !pub.ok) process.exit(1);

  // 2) 信息流能看到
  const feed = await call('postApi', { action: 'feed', page: 0 });
  const mine = feed.list.find(x => x.photos && x.photos[0] === fileId);
  console.log((mine ? '✓' : '✗') + ' 信息流包含新发布 | 共 ' + feed.list.length + ' 条');
  if(!mine) process.exit(1);
  const postId = mine._id;

  // 3) 点赞切换（+1 再 -1）
  const l1 = await call('postApi', { action: 'like', id: postId });
  const l2 = await call('postApi', { action: 'like', id: postId });
  console.log((l1.ok && l1.liked === true && l2.ok && l2.liked === false ? '✓' : '✗') + ' 点赞/取消切换 | ' + JSON.stringify({ l1, l2 }).slice(0, 120));

  // 4) 举报去重（同一人举报两次 → 第二次 already）
  const r1 = await call('postApi', { action: 'report', id: postId, reason: 'E2E测试举报' });
  const r2 = await call('postApi', { action: 'report', id: postId, reason: 'E2E测试举报' });
  console.log((r1.ok && !r1.already && r2.ok && r2.already ? '✓' : '✗') + ' 举报+同人去重 | ' + JSON.stringify({ r1, r2 }).slice(0, 140));

  // 5) 我的发布
  const m = await call('postApi', { action: 'mine' });
  const mFound = m.list.some(x => x._id === postId);
  console.log((mFound ? '✓' : '✗') + ' 我的发布可见 | 我的共 ' + m.list.length + ' 条');

  // 6) 删除（连带云存储文件）
  const d = await call('postApi', { action: 'del', id: postId });
  console.log((d.ok ? '✓' : '✗') + ' 删除 | ' + JSON.stringify(d));
  const feed2 = await call('postApi', { action: 'feed', page: 0 });
  const gone = !feed2.list.some(x => x._id === postId);
  console.log((gone ? '✓' : '✗') + ' 删除后信息流不再包含');

  const pass = mine && l1.ok && l2.ok && r1.ok && r2.ok && mFound && d.ok && gone;
  console.log(pass ? '\n✓✓ postApi 全周期通过' : '\n✗ 存在未通过项');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
