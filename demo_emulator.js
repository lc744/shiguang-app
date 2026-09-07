// 模拟器真机演示驱动：CDP 精确取坐标 → adb 发送真实触摸 → 截屏存档
const http = require('http');
const { execFileSync } = require('child_process');
const fs = require('fs');

const ADB = 'C:\\android-sdk\\platform-tools\\adb.exe';
let pass = 0, fail = 0;
function check(name, cond){ cond ? pass++ : fail++; console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); }

function cdpEval(expression){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cdp timeout')), 10000);
    http.get('http://127.0.0.1:9222/json', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const pages = JSON.parse(data).filter(x => x.type === 'page');
        const target = pages.find(x => x.title && x.title !== '') || pages[pages.length - 1];
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
        ws.onmessage = event => {
          const msg = JSON.parse(event.data);
          if(msg.id === 1){ clearTimeout(timer); ws.close(); resolve(msg.result && msg.result.result ? msg.result.result.value : undefined); }
        };
        ws.onerror = e => { clearTimeout(timer); reject(new Error('ws error')); };
      });
    }).on('error', e => { clearTimeout(timer); reject(e); });
  });
}
function adb(args){ return execFileSync(ADB, args, { encoding: 'utf8' }); }
let safeTopCss = 0;   // WebView 顶部相对屏幕的偏移（状态栏高度，CSS px）
function tap(cssX, cssY){
  const dpr = Number(globalThis.__dpr || 2.625);
  const x = Math.round(cssX * dpr), y = Math.round((cssY + safeTopCss) * dpr);
  adb(['shell', 'input', 'tap', String(x), String(y)]);
}
function shot(name){ adb(['exec-out', 'screencap', '-p']); }
function shotTo(name){
  const out = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { encoding: 'buffer' });
  fs.writeFileSync(name, out);
  console.log('截图: ' + name);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 取元素中心（CSS 坐标）
async function centerOf(selector){
  const v = await cdpEval(`(function(){ var el = ${selector}; if(!el) return null; var r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
  return v;
}
const q = s => `document.querySelector('${s.replace(/'/g, "\\'")}')`;
// 带自愈的触摸流程：触摸后校验状态，失败则（必要时先真实点击「我的」tab 找回页面）重试
async function realTapFlow(locate, verify, tries = 3){
  for(let i = 0; i < tries; i++){
    if(await cdpEval(`document.querySelector('.page.active').id !== 'page-profile'`)){
      const t = await centerOf(q('.tab[data-target="page-profile"]'));
      if(t){ tap(t.x, t.y); await sleep(1000); }
    }
    const c = await centerOf(locate);
    if(!c){ await sleep(400); continue; }
    tap(c.x, c.y);
    await sleep(700);
    if(await cdpEval(verify)) return true;
  }
  return false;
}

(async () => {
  await sleep(1000);
  globalThis.__dpr = await cdpEval('window.devicePixelRatio');
  safeTopCss = parseFloat(await cdpEval(`getComputedStyle(document.documentElement).getPropertyValue('--safe-top')`)) || 0;
  console.log('DPR: ' + __dpr + '  状态栏偏移: ' + safeTopCss + ' css px');
  const ready = await cdpEval('document.readyState + "|" + !!window.__NATIVE__');
  check('页面就绪且原生桥接生效', ready === 'complete|true');
  // 演示固定本机模式（云端未配置时避免触摸到云分支），设置后刷新生效
  await cdpEval(`try{ localStorage.setItem('shiguang_cloud_mode', 'off'); }catch(e){}; 'ok'`);
  await cdpEval(`location.reload(); 'reloading'`);
  await sleep(6000);
  safeTopCss = parseFloat(await cdpEval(`getComputedStyle(document.documentElement).getPropertyValue('--safe-top')`)) || safeTopCss;

  // 1. 首页截图
  shotTo('demo-emulator-01-home.png');

  // 2. 真实触摸「我的」tab
  let c = await centerOf(q('.tab[data-target="page-profile"]'));
  check('找到「我的」tab', !!c);
  tap(c.x, c.y);
  await sleep(1200);
  check('我的页已激活', await cdpEval(`document.querySelector('#page-profile').classList.contains('active')`));
  check('未登录状态', (await cdpEval(`document.querySelector('#userCard').textContent`)).includes('未登录'));
  shotTo('demo-emulator-02-profile.png');

  // 3. 触摸用户卡片 → 登录弹层
  c = await centerOf(q('#userCard .user-row'));
  tap(c.x, c.y);
  await sleep(600);
  check('登录弹层出现', await cdpEval(`document.querySelector('#loginOverlay').style.display === 'flex'`));
  shotTo('demo-emulator-03-login.png');

  // 4. 触摸「邮箱注册 / 登录」→ 注册模式
  c = await centerOf(`document.querySelector('#loginHome .primary')`);
  tap(c.x, c.y);
  await sleep(500);
  check('邮箱面板出现', await cdpEval(`document.querySelector('#loginEmail').style.display === 'block'`));
  c = await centerOf(`document.querySelector('#emailModeChips .chip[data-mode="register"]')`);
  tap(c.x, c.y);
  await sleep(400);
  check('注册模式（确认密码可见）', await cdpEval(`document.querySelector('#loginPass2Field').style.display === 'block'`));

  // 5. 触摸邮箱输入框 + 真实键盘输入（@ 会被 adb shell 吞掉，用 CDP 补全域名部分）
  // 注意：整个表单填写期间保持软键盘打开（中途收起会导致布局回弹、后续点击失准）
  c = await centerOf(q('#loginEmailInput'));
  tap(c.x, c.y);
  await sleep(400);
  adb(['shell', 'input', 'text', 'demo']);
  await sleep(300);
  await cdpEval(`document.querySelector('#loginEmailInput').value += '@example.com'`);
  check('邮箱已输入', (await cdpEval(`document.querySelector('#loginEmailInput').value`)) === 'demo@example.com');

  // 6. 密码与确认密码
  c = await centerOf(q('#loginPassInput'));
  tap(c.x, c.y);
  await sleep(300);
  adb(['shell', 'input', 'text', 'secret123']);
  c = await centerOf(q('#loginPass2Input'));
  tap(c.x, c.y);
  await sleep(300);
  adb(['shell', 'input', 'text', 'secret123']);
  await sleep(200);
  shotTo('demo-emulator-04-email-reg.png');

  // 7. 触摸「注册并登录」
  c = await centerOf(`document.querySelector('#emailSubmitBtn')`);
  tap(c.x, c.y);
  await sleep(1000);
  check('登录弹层关闭', await cdpEval(`document.querySelector('#loginOverlay').style.display === 'none'`));
  const card = await cdpEval(`document.querySelector('#userCard').textContent`);
  check('已登录·显示脱敏邮箱', card.includes('de***@example.com'));
  check('已登录·显示退出按钮', card.includes('退出'));
  shotTo('demo-emulator-05-logged-in.png');

  // 8. 触摸改昵称（带自愈重试）
  check('昵称弹层出现', await realTapFlow(q('.user-nick'), `document.querySelector('#nickOverlay').style.display === 'flex'`));
  c = await centerOf(q('#nickInput'));
  tap(c.x, c.y);
  await sleep(300);
  await cdpEval(`document.querySelector('#nickInput').value = ''`);
  adb(['shell', 'input', 'text', 'shiji']);
  await sleep(200);
  await cdpEval(`document.activeElement && document.activeElement.blur()`);   // 收起软键盘，避免布局位移
  await sleep(500);
  check('昵称已更新', await realTapFlow(`document.querySelector('#nickOverlay .primary')`, `document.querySelector('#nickOverlay').style.display === 'none'`) && (await cdpEval(`document.querySelector('#userCard .user-info b').textContent`)).includes('shiji'));
  shotTo('demo-emulator-06-nickname.png');

  // 9. 真实上滑滚动到页底 → 触摸「设置」按钮（带自愈重试）→ 原生权限卡片（App 专属）可见
  adb(['shell', 'input', 'swipe', '540', '1800', '540', '800', '350']);   // 上滑滚动（设置按钮在页面底部）
  await sleep(700);
  check('设置按钮打开设置弹层', await realTapFlow(q('.settings-entry'), `document.querySelector('#settingsOverlay').style.display === 'flex'`));
  check('原生权限卡片可见（App 专属）', await cdpEval(`document.querySelector('#nativePermCard').style.display === 'block'`));
  shotTo('demo-emulator-07-final.png');

  console.log(`\n结果: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('EMULATOR DEMO ERROR:', e.message); process.exit(1); });
