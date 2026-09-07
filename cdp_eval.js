const http = require('http');
const expression = process.argv.slice(2).join(' ');
http.get('http://127.0.0.1:9222/json', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const pages = JSON.parse(data).filter(x => x.type === 'page');
    // 多个 page 目标时优先选有标题的应用主页面，其次取最后一个（通常是新实例）
    const target = pages.find(x => x.title && x.title !== '') || pages[pages.length - 1];
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = event => { console.log(event.data); ws.close(); };
    ws.onerror = error => { console.error(error); process.exitCode = 1; };
  });
});
