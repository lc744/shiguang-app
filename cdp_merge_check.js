// 验证 WebView 合并原生动作：生日事件应标记为已完成
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

  // 等待启动时 mergeNativeActions 完成
  await new Promise(r => setTimeout(r, 3000));

  const r = await run(`(async function(){
    await mergeNativeActions();
    const e = events.find(x => x.id === 'bd-e2e-test');
    const store = await window.__consumeNativeActions();
    return JSON.stringify({
      eventFound: !!e,
      doneOn: e ? JSON.stringify(e.doneOn) : null,
      firedOn: e ? JSON.stringify(e.firedOn) : null,
      storeAfterConsume: JSON.stringify(store)
    });
  })()`);
  console.log(`合并后状态: ${r}`);

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
