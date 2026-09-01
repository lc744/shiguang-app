// CDP 验证编辑器生日开关交互 + 原生闹钟注册
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

  console.log('=== 编辑器生日开关测试 ===\n');

  // 1. 打开编辑器
  await run(`openEditor(null); true`);
  await new Promise(r => setTimeout(r, 500));
  const init = await run(`(function(){
    const b = document.getElementById('birthdayChip');
    const l = document.getElementById('lunarBirthdayChip');
    return JSON.stringify({
      birthdayVisible: !!b,
      birthdayText: b ? b.textContent : '',
      lunarHidden: l ? getComputedStyle(l).display === 'none' : true
    });
  })()`);
  console.log(`1. 初始状态: ${init}`);

  // 2. 开启生日模式
  await run(`toggleBirthday(document.getElementById('birthdayChip')); true`);
  const on = await run(`(function(){
    const b = document.getElementById('birthdayChip');
    const l = document.getElementById('lunarBirthdayChip');
    return JSON.stringify({
      birthdayText: b.textContent, birthdaySelected: b.classList.contains('selected'),
      lunarVisible: getComputedStyle(l).display !== 'none', lunarText: l.textContent
    });
  })()`);
  console.log(`2. 开启后: ${on}`);

  // 3. 切换农历生日
  await run(`toggleLunarBirthday(document.getElementById('lunarBirthdayChip')); true`);
  const lunar = await run(`(function(){
    const l = document.getElementById('lunarBirthdayChip');
    return JSON.stringify({ lunarText: l.textContent, lunarSelected: l.classList.contains('selected') });
  })()`);
  console.log(`3. 切农历后: ${lunar}`);

  // 4. 填写表单并保存农历生日事件（2分钟后响 → 用未来时间做闹钟注册验证）
  const now = new Date(Date.now() + 2 * 60000);
  const pad2 = n => String(n).padStart(2, '0');
  const tStr = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const saved = await run(`(function(){
    document.getElementById('fName').value = '测试寿星';
    document.getElementById('fDate').value = '${tStr}';
    document.getElementById('fTime').value = '${timeStr}';
    saveEvent();
    const e = events.find(x => x.name === '测试寿星');
    return e ? JSON.stringify({id: e.id, isBirthday: e.isBirthday, lunarBirthday: e.lunarBirthday, date: e.date, time: e.time}) : '未找到';
  })()`);
  console.log(`4. 保存农历生日: ${saved}（响铃 ${timeStr}）`);

  // 5. 等待原生闹钟注册，验证原生侧已排程
  await new Promise(r => setTimeout(r, 3000));
  const native = await run(`window.__getPermStatus ? __getPermStatus().then(s => JSON.stringify(s)).catch(() => 'no-status') : 'no-bridge'`);
  console.log(`5. 原生桥接: ${native}`);

  // 6. 验证事件在首页显示（今日待办）
  const home = await run(`(function(){
    showPage('page-home'); renderAll();
    return JSON.stringify({
      statTodo: document.getElementById('statTodo').textContent,
      inTodayList: document.getElementById('todayList').textContent.includes('测试寿星')
    });
  })()`);
  console.log(`6. 首页显示: ${home}`);

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
