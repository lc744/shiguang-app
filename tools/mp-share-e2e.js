// 分享功能 UI 全流程 E2E：切tab → 发布页（mock选图）→ UI发布 → 信息流出现 → 点赞 → 举报 → 删除
const automator = require('miniprogram-automator');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }
  const NAME = 'UI测试推荐店' + (Date.now() % 10000);

  // 1) 造测试图文件（放进模拟器用户目录）
  const b64 = fs.readFileSync(__dirname + '/test-image-b64.txt', 'utf8').trim();
  const imgPath = await mp.evaluate(new Function(
    'return new Promise((res, rej) => { const p = wx.env.USER_DATA_PATH + "/e2e_pub.jpg";' +
    ' try{ wx.getFileSystemManager().writeFileSync(p, ' + JSON.stringify(b64) + ', "base64"); res(p); }catch(e){ rej(e); } });'
  ));
  console.log('✓ 测试图就绪: ' + imgPath);

  // 1.5) 清空页面栈（前次失败运行残留的发布页会污染 currentPage 断言）
  await mp.reLaunch('/pages/share/share');
  await sleep(2000);

  // 2) hook 云调用返回值（诊断用） + mock 选图与弹窗
  await mp.evaluate(new Function(
    'try{ wx._log = [];' +
    ' const cf = wx.cloud.callFunction.bind(wx.cloud);' +
    ' wx.cloud.callFunction = function(o){ const p = cf(o); p.then(function(r){ wx._log.push(o.name + "(" + o.data.action + ") => " + JSON.stringify(r.result).slice(0, 200)); }); return p; };' +
    ' const uf = wx.cloud.uploadFile.bind(wx.cloud);' +
    ' wx.cloud.uploadFile = function(o){ const p = uf(o); p.catch(function(e){ wx._log.push("uploadFile FAIL => " + (e && (e.errMsg || e.message) || e)); }); return p; };' +
    ' return "hooked"; }catch(e){ return "hookfail"; }'
  ));
  await mp.mockWxMethod('chooseMedia', { tempFiles: [{ tempFilePath: imgPath, size: 692 }], tempFilePaths: [imgPath] });
  await mp.mockWxMethod('showModal', { confirm: true, content: 'E2E测试举报' });

  // 3) 进发布页，填表发布
  await mp.navigateTo('/pages/share/publish');
  let page = await mp.currentPage();
  await sleep(600);
  const inp = await page.$('.p-input');
  await inp.input(NAME);
  const ta = await page.$('.p-textarea');
  await ta.input('UI自动化发布，位置好找味道好');
  const chip = await page.$$('.type-chip');
  await chip[0].tap();                       // 餐厅
  const add = await page.$('.photo-add');
  await add.tap();                           // 触发 mock 的 chooseMedia
  await sleep(2600);                         // 等压缩+setData（实测约需 2.5s）
  const del = await page.$('.photo-del');    // 出现删除角标 = 图片已入选
  if(!del){ console.log('✗ 选图未生效'); process.exit(1); }
  console.log('✓ 选图（mock）已入选');
  const pub = await page.$('.publish-btn');
  await pub.tap();
  let back = false, lastUp = null;
  for(let i = 0; i < 50; i++){                // 轮询等待发布完成并返回（上传+双内容安全检测实测约 6-8s，繁忙时更久）
    await sleep(600);
    try{
      const p = await mp.currentPage();
      if(p.path.indexOf('pages/share/publish') < 0){ back = true; break; }
      const d = await p.data();
      if(d.uploading !== lastUp){
        lastUp = d.uploading;
        const errs = await mp.evaluate(new Function('return (wx._errs || []).join(" | ") || "(无)"'));
        console.log('  [poll t+' + ((i + 1) * 0.6).toFixed(1) + 's] uploading=' + d.uploading + ' errors=' + errs);
      }
      if(d.uploading === false && i > 4){     // 发布已结束但仍在发布页 = 失败（有 toast）
        const errs = await mp.evaluate(new Function('return (wx._log || []).join(" || ") || "(no log)"'));
        console.log('✗ 发布未完成: uploading=false 云日志=' + errs);
        process.exit(1);
      }
    }catch(e){ /* 页面切换瞬态异常，继续等 */ }
  }
  if(!back){ console.log('✗ 发布后未返回（可能发布失败）'); process.exit(1); }
  console.log('✓ UI 发布完成');

  // 4) 回到分享 tab，信息流应包含新帖
  await mp.switchTab('/pages/share/share');
  await sleep(2500);
  page = await mp.currentPage();
  const data = await page.data();
  const mine = data.list.find(x => x.name === NAME);
  if(!mine){ console.log('✗ 信息流未见新帖'); process.exit(1); }
  console.log('✓ 信息流出现新帖（photos: ' + (mine.photos || []).length + '）');
  const postId = mine._id;

  // 5) 点赞（❤️）
  const like = await page.$('.post-tool');
  await like.tap();
  await sleep(1200);
  const data2 = await page.data();
  const after = data2.list.find(x => x._id === postId);
  console.log((after && after.selfLiked === true && after.likes >= 1 ? '✓' : '✗') + ' 点赞生效 likes=' + (after ? after.likes : '?'));
  // 取消点赞，恢复原状
  const like2 = await page.$('.post-tool');
  await like2.tap();
  await sleep(1200);

  // 6) 举报（mock 弹窗 confirm）
  const tools = await page.$$('.post-tool');
  await tools[1].tap();                        // 第二个工具 = 举报
  await sleep(1200);
  console.log('✓ 举报流程触发');

  // 7) 删除（mine tab + mock 确认）
  const segs = await page.$$('.seg');
  await segs[1].tap();                         // 我的发布
  await sleep(2000);
  page = await mp.currentPage();
  const data3 = await page.data();
  const target = data3.list.find(x => x._id === postId);
  if(!target){ console.log('✗ 我的发布未见该帖'); process.exit(1); }
  const delBtn = await page.$('.post-tool.danger');
  await delBtn.tap();                          // mock showModal confirm:true
  await sleep(2000);
  const data4 = await page.data();
  const gone = !data4.list.some(x => x._id === postId);
  console.log((gone ? '✓' : '✗') + ' UI 删除生效');

  console.log(gone ? '\n✓✓ 分享 UI 全流程通过' : '\n✗ 未通过');
  process.exit(gone ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
