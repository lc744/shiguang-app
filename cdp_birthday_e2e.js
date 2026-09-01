// 在 WebView 内部用模拟器时钟创建 2 分钟后的生日事件
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

  // 删除旧的主机时区事件，用模拟器时钟重建
  const r = await run(`(function(){
    events = events.filter(e => e.name !== '测试寿星');
    persist();
    const now = new Date(Date.now() + 2 * 60000);
    const pad2 = n => String(n).padStart(2, '0');
    const time = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    const t = now.getFullYear() + '-' + pad2(now.getMonth()+1) + '-' + pad2(now.getDate());
    events.push({id:'bd-e2e-test', name:'测试寿星', note:'', date:t, time:time, emoji:'🎂 生日快乐', voice:'温柔女声', voiceData:null, weekdays:[], isBirthday:true, lunarBirthday:true, doneOn:[], firedOn:[]});
    persist(); renderAll();
    syncNativeNotifs();
    return JSON.stringify({date: t, time: time});
  })()`);
  console.log(`事件已建（模拟器时钟 +2 分钟）: ${r}`);

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
