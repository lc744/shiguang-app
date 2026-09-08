// 临时探针：线上注册 UI 流程验证（发码→验证码框→错误处理）
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  let loaded = false;
  for(let i = 0; i < 4 && !loaded; i++){ try{ await p.goto('https://lc744.github.io/shiguang-app/', { waitUntil: 'load', timeout: 60000 }); loaded = true; }catch(e){} }
  if(!loaded){ console.log('页面加载失败'); process.exit(1); }
  await p.waitForTimeout(4000);
  const out = {};
  await p.click('.tab[data-target="page-profile"]');
  await p.waitForTimeout(400);
  await p.click('#userCard .user-row');
  await p.waitForTimeout(400);
  out.hint = await p.evaluate(() => document.getElementById('loginModeHint').textContent.slice(0, 34));
  await p.click('#loginHome button:has-text("邮箱注册 / 登录")');
  await p.waitForTimeout(300);
  await p.click('#emailModeChips .chip[data-mode="register"]');
  await p.waitForTimeout(200);
  await p.fill('#loginEmailInput', 'probe-registration@example.com');
  await p.fill('#loginPassInput', 'Test#12345678');
  await p.fill('#loginPass2Input', 'Test#12345678');
  await p.click('#emailSubmitBtn');
  await p.waitForTimeout(6000);
  out.codeFieldVisible = await p.evaluate(() => document.getElementById('loginCodeField').style.display);
  out.buttonLabel = await p.evaluate(() => document.getElementById('emailSubmitBtn').textContent);
  out.err = await p.evaluate(() => { const e = document.getElementById('errEmail'); return e.style.display !== 'none' ? e.textContent.slice(0, 60) : ''; });
  if(out.codeFieldVisible === 'block'){
    await p.fill('#loginEmailCodeInput', '000000');
    await p.click('#emailSubmitBtn');
    await p.waitForTimeout(5000);
    out.wrongCodeErr = await p.evaluate(() => { const e = document.getElementById('errEmail'); return e.style.display !== 'none' ? e.textContent.slice(0, 60) : '(无错误提示?)'; });
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
