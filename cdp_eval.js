const http = require('http');
const expression = process.argv.slice(2).join(' ');
http.get('http://127.0.0.1:9222/json', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const target = JSON.parse(data).find(x => x.type === 'page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = event => { console.log(event.data); ws.close(); };
    ws.onerror = error => { console.error(error); process.exitCode = 1; };
  });
});
