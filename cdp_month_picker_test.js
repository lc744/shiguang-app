// 验证年月选择器
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
  if(!page){ console.log('✗ 无 WebView 目标'); process.exit(1); }
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

  console.log('=== 年月选择器测试 ===\n');

  // 1. 进日历页，点标题打开
  await run(`showPage('page-calendar'); true`);
  const t1 = await run(`(function(){
    openMonthPicker();
    const ov = document.getElementById('monthPickerOverlay');
    return JSON.stringify({
      visible: ov.style.display === 'flex',
      yearLabel: document.getElementById('ypYearLabel').textContent,
      monthBtns: document.querySelectorAll('.yp-month').length,
      selectedMark: !!document.querySelector('.yp-month.yp-selected'),
      currentMark: !!document.querySelector('.yp-month.yp-current')
    });
  })()`);
  const d1 = JSON.parse(t1);
  console.log(`1. 打开: 显示=${d1.visible} 年=${d1.yearLabel} 月按钮数=${d1.monthBtns} 当前选中标记=${d1.selectedMark} 今天标记=${d1.currentMark}`);

  // 2. 翻年份
  const t2 = await run(`(function(){
    shiftPickerYear(1); shiftPickerYear(1);
    return document.getElementById('ypYearLabel').textContent;
  })()`);
  console.log(`2. 翻 2 年: ${t2}（${t2 === '2028' ? '✓' : '✗'}）`);

  // 3. 边界限制
  const t3 = await run(`(function(){
    pickerYear = 2100; shiftPickerYear(1);
    const max = document.getElementById('ypYearLabel').textContent;
    pickerYear = 1900; shiftPickerYear(-1);
    const min = document.getElementById('ypYearLabel').textContent;
    return min + '~' + max;
  })()`);
  console.log(`3. 边界: ${t3}（应为 1901~2099）${t3 === '1901~2099' ? '✓' : '✗'}`);

  // 4. 选 2028 年 3 月
  const t4 = await run(`(function(){
    pickerYear = 2028; renderMonthPicker();
    pickMonth(2); // 3月
    return JSON.stringify({
      title: document.getElementById('monthTitle').textContent.trim(),
      overlayClosed: document.getElementById('monthPickerOverlay').style.display === 'none',
      daysRendered: document.querySelectorAll('#daysGrid .day').length
    });
  })()`);
  const d4 = JSON.parse(t4);
  console.log(`4. 选 2028-03: 标题="${d4.title}" 弹层关闭=${d4.overlayClosed} 格子数=${d4.daysRendered} ${d4.title.includes('2028') && d4.title.includes('3') && d4.daysRendered >= 28 ? '✓' : '✗'}`);

  // 5. 农历和节日在新年月正常
  const t5 = await run(`(function(){
    // 2028 春节是 1月26日（农历正月初一）
    pickerYear = 2028; calMonth = 0; renderCalendar();
    const cells = [...document.querySelectorAll('#daysGrid .day')];
    const spring = cells.find(c => { const s = c.querySelector('small'); return s && s.textContent === '春节'; });
    return spring ? spring.querySelector('span').textContent : '未找到';
  })()`);
  console.log(`5. 2028春节: ${t5}日 ${t5 === '26' ? '✓' : '（核对）'}`);

  // 6. 回到今天
  const t6 = await run(`(function(){
    jumpToTodayMonth();
    const now = new Date();
    const title = document.getElementById('monthTitle').textContent;
    return JSON.stringify({ title: title.trim(), ok: title.includes(String(now.getFullYear())) && title.includes(String(now.getMonth()+1)) });
  })()`);
  const d6 = JSON.parse(t6);
  console.log(`6. 回到今天: "${d6.title}" ${d6.ok ? '✓' : '✗'}`);

  // 7. 点遮罩关闭
  const t7 = await run(`(function(){
    openMonthPicker();
    document.getElementById('monthPickerOverlay').dispatchEvent(new MouseEvent('click'));
    return document.getElementById('monthPickerOverlay').style.display === 'none';
  })()`);
  console.log(`7. 遮罩点击关闭: ${t7 ? '✓' : '✗'}`);

  await run(`showPage('page-home'); renderAll(); true`);
  console.log('\n✓ 验证完成');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
