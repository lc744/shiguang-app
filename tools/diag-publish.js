// 发布卡住诊断：表单数据 → hook 云接口错误 → 点发布 → 轮询状态与错误
const automator = require('miniprogram-automator');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){ try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); } }
  const NAME = 'DIAG店' + (Date.now() % 10000);

  const b64 = fs.readFileSync(__dirname + '/test-image-b64.txt', 'utf8').trim();
  const imgPath = await mp.evaluate(new Function(
    'return new Promise((res, rej) => { const p = wx.env.USER_DATA_PATH + "/e2e_pub.jpg";' +
    ' try{ wx.getFileSystemManager().writeFileSync(p, ' + JSON.stringify(b64) + ', "base64"); res(p); }catch(e){ rej(e); } });'
  ));

  // hook 云接口错误（记录到全局数组）
  await mp.evaluate(new Function(
    'try{ wx._errs = wx._errs || [];' +
    ' const uf = wx.cloud.uploadFile.bind(wx.cloud);' +
    ' wx.cloud.uploadFile = function(o){ const p = uf(o); p.catch(function(e){ wx._errs.push("uploadFile: " + (e && (e.errMsg || e.message) || e)); }); return p; };' +
    ' const cf = wx.cloud.callFunction.bind(wx.cloud);' +
    ' wx.cloud.callFunction = function(o){ const p = cf(o); p.catch(function(e){ wx._errs.push("callFunction " + o.name + ": " + (e && (e.errMsg || e.message) || e)); }); return p; };' +
    ' return "hooked"; }catch(e){ return "hook失败: " + e.message; }'
  )).then(v => console.log('hook: ' + v));

  await mp.mockWxMethod('chooseMedia', { tempFiles: [{ tempFilePath: imgPath, size: 692 }], tempFilePaths: [imgPath] });
  await mp.navigateTo('/pages/share/publish');
  await sleep(800);
  let page = await mp.currentPage();

  const inp = await page.$('.p-input');
  await inp.input(NAME);
  const ta = await page.$('.p-textarea');
  await ta.input('诊断发布');
  const chip = await page.$$('.type-chip');
  await chip[0].tap();
  const add = await page.$('.photo-add');
  await add.tap();
  await sleep(2600);

  const before = await page.data();
  console.log('发布前: name="' + before.name + '" photos=' + before.photos.length + ' type=' + before.type + ' nickname="' + before.nickname + '"');

  const pub = await page.$('.publish-btn');
  await pub.tap();
  for(let i = 0; i < 10; i++){
    await sleep(2000);
    const d = await page.data();
    const errs = await mp.evaluate(new Function('return (wx._errs || []).join(" | ") || "(无)"'));
    console.log('t+' + ((i + 1) * 2) + 's uploading=' + d.uploading + ' errors=' + errs);
    if(!d.uploading) break;
  }
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
