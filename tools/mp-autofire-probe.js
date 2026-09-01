// 导航探针版到点测试：给 wx.navigateTo 打补丁，记录每次调用的 success/fail
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const p2 = n => String(n).padStart(2, '0');

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); }
  }

  // 安装导航探针（AppService 上下文）
  await mp.evaluate(() => {
    const g = globalThis;
    if(!g.__navLog){
      g.__navLog = [];
      const orig = wx.navigateTo.bind(wx);
      wx.navigateTo = function(opt){
        g.__navLog.push({ call: opt.url, t: new Date().toTimeString().slice(0, 8) });
        return orig(Object.assign({}, opt, {
          success: r => { g.__navLog.push({ ok: true, t: new Date().toTimeString().slice(0, 8) }); if(opt.success) opt.success(r); },
          fail: e => { g.__navLog.push({ fail: (e && e.errMsg) || 'unknown', t: new Date().toTimeString().slice(0, 8) }); if(opt.fail) opt.fail(e); }
        }));
      };
    }
    return 'probe installed';
  });
  console.log('✓ 导航探针已安装');

  // 建一个下一分钟到期的事件
  const due = new Date(Date.now() + 75 * 1000);
  const hhmm = p2(due.getHours()) + ':' + p2(due.getMinutes());
  await mp.switchTab('/pages/home/home');
  await sleep(500);
  await mp.navigateTo('/pages/editor/editor');
  await sleep(700);
  let page = await mp.currentPage();
  await (await page.$('input')).input('探针到点测试');
  const pickers = await page.$$('picker');
  for(const pk of pickers){
    let label = '';
    try{ const lbl = await pk.$('.meta-label'); label = lbl ? await lbl.text() : ''; }catch(e){}
    if(/时间/.test(label)){ await pk.trigger('change', { value: hhmm }); break; }
  }
  await sleep(300);
  const fd = await page.data('form');
  console.log('到期时刻 ' + hhmm + '，form.time=' + fd.time);
  await (await page.$('.action-row .primary')).tap();
  await sleep(1000);

  // 高频轮询 100 秒：每 500ms 看一次当前页
  let sawRemind = false;
  for(let i = 0; i < 200; i++){
    await sleep(500);
    page = await mp.currentPage();
    if(page.path === 'pages/remind/remind'){ sawRemind = true; console.log('✓ 第 ' + i + ' 次轮询捕捉到提醒页'); break; }
  }
  const navLog = await mp.evaluate(() => globalThis.__navLog || []);
  console.log('--- 导航日志 ---');
  (navLog || []).forEach((n, i) => console.log(i + ': ' + JSON.stringify(n)));
  console.log(sawRemind ? '✓✓ 自动弹窗成功' : '✗ 100 秒高频轮询仍未捕捉到提醒页');
  process.exit(sawRemind ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
