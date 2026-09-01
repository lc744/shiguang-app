// CDP 验证 hero 区新排版
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
    pending[myId] = m => resolve(m.result && m.result.result ? m.result.result.value : 'NO_RESULT');
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  const r = await run(`JSON.stringify({
    heroExists: !!document.querySelector('.hero'),
    heroCountExists: !!document.getElementById('heroCount'),
    heroCat: document.getElementById('heroCat') ? document.getElementById('heroCat').textContent : null,
    heroTitle: document.getElementById('heroMainTitle') ? document.getElementById('heroMainTitle').textContent : null,
    heroDesc: document.getElementById('heroDesc') ? document.getElementById('heroDesc').textContent : null,
    heroHTML: document.querySelector('.hero') ? document.querySelector('.hero').innerHTML.substring(0, 600) : null
  })`);
  console.log(r);
  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
