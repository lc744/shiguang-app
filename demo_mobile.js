// 移动真机仿真演示：Pixel 7 参数 + 触摸操作，跑线上公共站点（邮箱登录流程）
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL || 'https://lc744.github.io/shiguang-app/';
let pass = 0, fail = 0;
function check(name, cond){ cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name); }

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  await page.addInitScript(() => { try{ localStorage.setItem('shiguang_cloud_mode', 'off'); }catch(e){} });   // 演示固定本机模式
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1. 首页（手机竖屏）
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'demo-01-home.png' });
  check('首页标题=绸缪', (await page.title()) === '绸缪');
  check('底部4个tab', await page.locator('.tab').count() === 4);
  check('「我的」tab存在', await page.locator('.tab:has-text("我的")').count() === 1);

  // 2. 触摸「我的」
  await page.tap('.tab:has-text("我的")');
  await page.waitForTimeout(400);
  check('我的页激活', await page.locator('#page-profile.active').count() === 1);
  check('未登录卡片', (await page.locator('#userCard').textContent()).includes('未登录'));
  await page.screenshot({ path: 'demo-02-profile.png' });

  // 3. 手机号/微信置灰
  check('手机号按钮已禁用', await page.locator('#loginHome button.auth-disabled:has-text("手机号")').isDisabled());

  // 4. 打开登录 → 邮箱注册
  await page.tap('#userCard .user-row');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'demo-03-login-home.png' });
  await page.tap('#loginHome button:has-text("邮箱注册 / 登录")');
  await page.tap('#emailModeChips .chip[data-mode="register"]');
  await page.fill('#loginEmailInput', 'demo@example.com');
  await page.fill('#loginPassInput', 'secret123');
  await page.fill('#loginPass2Input', 'secret123');
  await page.screenshot({ path: 'demo-04-email-reg.png' });
  await page.tap('#emailSubmitBtn');
  await page.waitForTimeout(400);
  check('注册后显示脱敏邮箱', (await page.locator('#userCard').textContent()).includes('de***@example.com'));
  await page.screenshot({ path: 'demo-05-logged-in.png' });

  // 5. 触摸改昵称
  await page.tap('.user-nick');
  await page.fill('#nickInput', '真机演示用户');
  await page.tap('#nickOverlay button:has-text("保存")');
  await page.waitForTimeout(300);
  check('昵称已改', (await page.locator('#userCard .user-info b').textContent()).includes('真机演示用户'));

  // 6. 个人信息卡 + 设置按钮（设置收进按钮）
  check('信息卡显示完整邮箱', (await page.locator('#infoCard').textContent()).includes('demo@example.com'));
  check('我的页无平铺设置卡片', await page.locator('#page-profile #themeChips').count() === 0);
  await page.tap('#page-profile .settings-entry');
  check('设置按钮打开设置弹层', await page.locator('#settingsOverlay').isVisible());
  check('设置弹层含语音包', await page.locator('#settingsOverlay #voicePackList').count() === 1);
  await page.tap('#settingsOverlay button:has-text("完成")');

  // 7. 深色模式（跟随系统仿真切换，在设置弹层内）
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.tap('#page-profile .settings-entry');
  await page.waitForTimeout(200);
  await page.tap('#themeChips .chip[data-theme="system"]');
  await page.waitForTimeout(300);
  check('深色主题生效', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark');
  await page.screenshot({ path: 'demo-07-dark.png' });
  await page.tap('#settingsOverlay button:has-text("完成")');

  console.log(`\n结果: ${pass} PASS, ${fail} FAIL`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('DEMO ERROR:', e.message); process.exit(1); });
