// 通过 CDP 检查 WebView 运行时状态
const http = require('http');

function getJson() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const pages = await getJson();
  const page = pages.find(p => p.type === 'page');
  console.log('页面:', page.title);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(res => ws.addEventListener('open', res));

  const pending = {};
  let id = 0;
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  });
  const run = (expression) => new Promise(resolve => {
    const myId = ++id;
    pending[myId] = m => resolve(m.result && m.result.result ? m.result.result.value : JSON.stringify(m));
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });

  // 等待状态栏高度应用
  await new Promise(r => setTimeout(r, 1500));

  const r1 = await run(`JSON.stringify({
    native: !!window.__NATIVE__,
    getStatusBarHeight: typeof window.__getStatusBarHeight,
    bodyClass: document.body.className,
    safeTopVar: getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
    shellPadTop: getComputedStyle(document.querySelector('.shell')).paddingTop,
    webOnlyCount: document.querySelectorAll('.web-only').length,
    webOnlyDisplay: Array.from(document.querySelectorAll('.web-only')).map(el => getComputedStyle(el).display).join(','),
    fabExists: !!document.getElementById('fabAdd')
  })`);
  console.log('状态:', r1);

  // 直接调用 getStatusBarHeight 验证
  const r2 = await run(`window.__getStatusBarHeight().then(h => JSON.stringify(h)).catch(e => 'ERR:' + e.message)`);
  console.log('状态栏高度(px):', r2);

  // 验证设置页 web-only 是否隐藏（DOM 层面）
  const r3 = await run(`Array.from(document.querySelectorAll('.web-only')).map(el => el.style.display || getComputedStyle(el).display).join(',')`);
  console.log('web-only display:', r3);

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
