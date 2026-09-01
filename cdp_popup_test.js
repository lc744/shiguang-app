// CDP: 创建 1 分钟后的事件用于弹窗测试
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
    pending[myId] = m => resolve(m.result && m.result.result ? m.result.result.value : JSON.stringify(m.result));
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  const r = await run(`(() => {
    events = events.filter(e => !e.id.startsWith('popup-test'));
    const now = new Date(Date.now() + 1 * 60000);
    const pad2 = n => String(n).padStart(2, '0');
    const time = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    const t = now.getFullYear() + '-' + pad2(now.getMonth()+1) + '-' + pad2(now.getDate());
    const ev = { id: 'popup-test-' + Date.now(), name: '弹窗测试', note: '后台弹窗验证', time: time,
      repeat: 'none', date: t, emoji: '🔔', voice: '标准播报', doneOn: [], firedOn: [], created: Date.now() };
    events.push(ev);
    persist();
    return JSON.stringify({time: ev.time, id: ev.id});
  })()`);
  console.log('创建:', r);
  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
