// CDP: 验证背景色与错过横幅持久化
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

  // 1. 设置背景色为 #fce7f3（粉色）并创建错过事件
  const setup = await run(`(() => {
    saveBgColor('#fce7f3');
    const ev = { id: 'missed-persist-1', name: '过期事件测试', note: '', time: '00:05', repeat: 'none', date: todayStr(),
      emoji: '⏰', voice: '标准播报', doneOn: [], firedOn: [], created: Date.now() };
    events.push(ev);
    persist();
    renderHome();
    return JSON.stringify({
      saved: localStorage.getItem('shiguang_bg_color'),
      bannerVisible: document.getElementById('missedBanner').style.display,
      bannerText: document.getElementById('missedBanner').textContent.substring(0, 40)
    });
  })()`);
  console.log('设置后:', setup);

  await new Promise(r => setTimeout(r, 500));

  // 2. 隐藏错过横幅
  const hide = await run(`(() => { hideMissedBanner(); return JSON.stringify({
    stored: localStorage.getItem('shiguang_missed_hidden_' + todayStr()),
    bannerVisible: document.getElementById('missedBanner').style.display
  }); })()`);
  console.log('隐藏后:', hide);

  // 3. 模拟切 App 回来 = WebView 重新加载
  await run(`location.reload()`);
  await new Promise(r => setTimeout(r, 3500));

  const after = await run(`JSON.stringify({
    bgStored: localStorage.getItem('shiguang_bg_color'),
    bgApplied: getComputedStyle(document.documentElement).getPropertyValue('--page-bg'),
    bannerDisplay: document.getElementById('missedBanner').style.display,
    bannerInner: document.getElementById('missedBanner').innerHTML.substring(0, 30)
  })`);
  console.log('重载后:', after);
  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
