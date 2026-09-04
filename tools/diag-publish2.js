// 抓 postApi 返回的具体 error
const automator = require('miniprogram-automator');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){ try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); } }
  const NAME = 'UI测试推荐店' + (Date.now() % 10000);
  const b64 = fs.readFileSync(__dirname + '/test-image-b64.txt', 'utf8').trim();
  const imgPath = await mp.evaluate(new Function(
    'return new Promise((res, rej) => { const p = wx.env.USER_DATA_PATH + "/e2e_pub.jpg";' +
    ' try{ wx.getFileSystemManager().writeFileSync(p, ' + JSON.stringify(b64) + ', "base64"); res(p); }catch(e){ rej(e); } });'
  ));
  const hooked = await mp.evaluate(new Function(
    'try{ wx._log = [];' +
    ' const cf = wx.cloud.callFunction.bind(wx.cloud);' +
    ' wx.cloud.callFunction = function(o){ const p = cf(o); p.then(function(r){ wx._log.push(o.name + "(" + o.data.action + ") => " + JSON.stringify(r.result).slice(0, 200)); }); return p; };' +
    ' return "hooked"; }catch(e){ return "fail: " + e.message; }'
  ));
  console.log('hook: ' + hooked);
  await mp.mockWxMethod('chooseMedia', { tempFiles: [{ tempFilePath: imgPath, size: 692 }], tempFilePaths: [imgPath] });
  await mp.navigateTo('/pages/share/publish');
  await sleep(800);
  const page = await mp.currentPage();
  const inp = await page.$('.p-input');
  await inp.input(NAME);
  const ta = await page.$('.p-textarea');
  await ta.input('UI自动化发布，位置好找味道好');
  const chip = await page.$$('.type-chip');
  await chip[0].tap();
  const add = await page.$('.photo-add');
  await add.tap();
  await sleep(2600);
  const pub = await page.$('.publish-btn');
  await pub.tap();
  await sleep(9000);
  const log = await mp.evaluate(new Function('return (wx._log || []).join(" || ") || "(no calls)"'));
  console.log('云调用日志: ' + log);
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
