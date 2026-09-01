// 检查生日弹窗是否在 Web 层触发
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
    pending[myId] = m => resolve(m.result && m.result.result ? m.result.result.value : null);
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });

  const state = await run(`(function(){
    const ov = document.getElementById('remindOverlay');
    const e = events.find(x => x.name === '测试寿星');
    return JSON.stringify({
      overlayShown: ov.classList.contains('show'),
      rName: document.getElementById('rName').textContent,
      rNote: document.getElementById('rNote').textContent,
      rEmoji: document.getElementById('rEmoji').textContent,
      fired: e ? JSON.stringify(e.firedOn) : 'no-event'
    });
  })()`);
  console.log(`生日弹窗状态: ${state}`);

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
