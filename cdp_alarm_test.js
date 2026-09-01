// CDP: 创建 2 分钟后的测试事件并验证闹钟注册
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

  // 创建 2 分钟后的测试事件（不重复）
  const create = await run(`(() => {
    const now = new Date(Date.now() + 2 * 60000);
    const pad2 = n => String(n).padStart(2, '0');
    const time = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    const t = now.getFullYear() + '-' + pad2(now.getMonth()+1) + '-' + pad2(now.getDate());
    const ev = {
      id: 'test-kill-' + Date.now(),
      name: '杀后台测试',
      note: '测试闹钟',
      time: time,
      repeat: 'none',
      date: t,
      emoji: '⏰',
      voice: '标准播报',
      doneOn: [],
      firedOn: [],
      created: Date.now()
    };
    events.push(ev);
    persist();
    return JSON.stringify({created: ev.time, id: ev.id, native: !!window.__NATIVE__});
  })()`);
  console.log('创建事件:', create);

  // 验证闹钟是否已注册到原生
  await new Promise(r => setTimeout(r, 2000));
  const status = await run(`window.__getPermStatus().then(s => JSON.stringify(s))`);
  console.log('权限状态:', status);
  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
