// 清理测试事件
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

  const r = await run(`(function(){
    const before = events.length;
    events = events.filter(e => e.id !== 'bd-e2e-test' && e.name !== '测试寿星');
    persist(); renderAll();
    return JSON.stringify({before: before, after: events.length, remaining: events.map(e => e.name)});
  })()`);
  console.log(`清理: ${r}`);

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
