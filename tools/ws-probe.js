// 原始 WebSocket 探测小程序自动化协议（绕过 automator SDK）
// 用法：node tools/ws-probe.js
const ws = new WebSocket('ws://127.0.0.1:9420');
const seen = [];
let id = 0;
const pending = new Map();

ws.onopen = () => {
  console.log('✓ ws 已连接');
  // 探测1：获取页面栈
  send('App.getPageStack', {});
  // 探测2：系统信息
  setTimeout(() => send('Tool.getInfo', {}), 1500);
  setTimeout(() => {
    console.log('\n— 探测结束 —');
    console.log('收到消息数: ' + seen.length);
    seen.forEach((m, i) => console.log(`[${i}] ` + String(m).slice(0, 200)));
    process.exit(seen.length ? 0 : 2);
  }, 8000);
};
ws.onmessage = e => { seen.push(e.data); console.log('← ' + String(e.data).slice(0, 180)); };
ws.onerror = e => { console.log('✗ ws 错误: ' + (e.message || 'unknown')); process.exit(1); };
ws.onclose = e => { console.log('ws 关闭 code=' + e.code); };

function send(method, params){
  const msg = JSON.stringify({ id: ++id, method, params: params || {} });
  console.log('→ ' + msg);
  ws.send(msg);
}
