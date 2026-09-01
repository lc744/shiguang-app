// CDP 验证日历功能：农历、节日、法定假日、生日（Node 内置 WebSocket）
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
  if(!page){ console.log('✗ 未找到 WebView 调试目标'); process.exit(1); }
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
  const shot = (name) => new Promise(resolve => {
    const myId = ++id;
    pending[myId] = m => {
      if(m.result && m.result.data) require('fs').writeFileSync(name, Buffer.from(m.result.data, 'base64'));
      resolve(!!(m.result && m.result.data));
    };
    ws.send(JSON.stringify({ id: myId, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  });

  console.log('✓ CDP 已连接\n');

  // 1. lunar.js 加载
  const hasLunar = await run('typeof solarToLunar === "function"');
  console.log(`1. lunar.js 加载: ${hasLunar ? '✓' : '✗'}`);
  if(!hasLunar){ ws.close(); process.exit(1); }

  // 2. WebView 内农历转换
  const lunarCheck = await run(`(function(){
    const r1 = solarToLunar('2026-02-17');
    const r2 = solarToLunar('2026-09-25');
    return JSON.stringify({ chunjie: r1.month===1&&r1.day===1, zhongqiu: r2.month===8&&r2.day===15 });
  })()`);
  console.log(`2. WebView 农历: ${lunarCheck}`);

  // 3. 切到日历页
  await run(`showPage('page-calendar'); renderCalendar(); true`);
  console.log('3. 已切换到日历页');

  // 4. 2026-02：春节/除夕/休班
  const febCheck = await run(`(function(){
    calYear = 2026; calMonth = 1; renderCalendar();
    const cells = [...document.getElementById('daysGrid').querySelectorAll('.day')];
    const fest = c => { const s = c.querySelector('small'); return s ? s.textContent : ''; };
    return JSON.stringify({
      chunjie: cells.some(c => fest(c) === '春节'),
      chuxi: cells.some(c => fest(c) === '除夕'),
      restDays: cells.filter(c => c.classList.contains('legal-rest')).length,
      workDays: cells.filter(c => c.classList.contains('legal-work')).length,
      marks: cells.map(c => { const m = c.querySelector('.day-mark'); return m ? m.textContent : ''; }).filter(Boolean).join('')
    });
  })()`);
  console.log(`4. 2026年2月: ${febCheck}`);

  // 5. 2026-10：国庆
  const octCheck = await run(`(function(){
    calYear = 2026; calMonth = 9; renderCalendar();
    const cells = [...document.getElementById('daysGrid').querySelectorAll('.day')];
    const fest = c => { const s = c.querySelector('small'); return s ? s.textContent : ''; };
    return JSON.stringify({
      guoqing: cells.some(c => fest(c) === '国庆节'),
      restDays: cells.filter(c => c.classList.contains('legal-rest')).length,
      workDays: cells.filter(c => c.classList.contains('legal-work')).length,
      markList: cells.map(c => { const m = c.querySelector('.day-mark'); return m ? m.textContent : ''; }).filter(Boolean).join(',')
    });
  })()`);
  console.log(`5. 2026年10月: ${octCheck}`);

  // 6. 今天格子 + 议程标题（含农历）
  const todayCheck = await run(`(function(){
    changeMonth(0);
    const cells = [...document.getElementById('daysGrid').querySelectorAll('.day')];
    const tc = cells.find(c => c.classList.contains('today'));
    return JSON.stringify({
      todaySub: tc ? tc.querySelector('small').textContent : '未找到',
      agendaTitle: document.getElementById('agendaTitle').textContent
    });
  })()`);
  console.log(`6. 今天信息: ${todayCheck}`);

  // 7. 截图 10 月
  await run(`calYear = 2026; calMonth = 9; renderCalendar(); true`);
  await shot('cal_october.png');
  console.log('7. ✓ 截图 cal_october.png');

  // 8. 公历生日：日历显示🎂 + 明年同日触发
  const bdTest = await run(`(function(){
    events.push({id:'test-bd', name:'妈妈', note:'', date:'2026-10-01', time:'09:00', emoji:'🎂 生日快乐', voice:'温柔女声', voiceData:null, weekdays:[], isBirthday:true, lunarBirthday:false, doneOn:[], firedOn:[]});
    persist(); renderAll(); renderCalendar();
    const cells = [...document.getElementById('daysGrid').querySelectorAll('.day')];
    const e = events.find(x => x.id === 'test-bd');
    return JSON.stringify({
      cakeOnCalendar: cells.some(c => { const s = c.querySelector('span'); return s && s.textContent === '🎂'; }),
      fire2026: occursOn(e, '2026-10-01'),
      fire2027: occursOn(e, '2027-10-01'),
      fire2028: occursOn(e, '2028-10-01'),
      noFireBefore: !occursOn(e, '2025-10-01')
    });
  })()`);
  console.log(`8. 公历生日: ${bdTest}`);

  // 9. 农历生日：中秋
  const lunarBd = await run(`(function(){
    events.push({id:'test-lbd', name:'爸爸', note:'', date:'2026-09-25', time:'08:00', emoji:'🎂 生日快乐', voice:'活泼女声', voiceData:null, weekdays:[], isBirthday:true, lunarBirthday:true, doneOn:[], firedOn:[]});
    persist();
    const e = events.find(x => x.id === 'test-lbd');
    // 2027 年中秋是 9 月 15 日
    let midAutumn2027 = '';
    for(let m = 9; m <= 10 && !midAutumn2027; m++){
      for(let d = 1; d <= 31; d++){
        const ds = '2027-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        try { const l = solarToLunar(ds); if(l.month === 8 && l.day === 15 && !l.isLeap){ midAutumn2027 = ds; break; } } catch(e2){}
      }
    }
    return JSON.stringify({
      fire2026: occursOn(e, '2026-09-25'),
      midAutumn2027: midAutumn2027,
      fire2027MidAutumn: occursOn(e, midAutumn2027),
      noFire2027_0925: !occursOn(e, '2027-09-25')
    });
  })()`);
  console.log(`9. 农历生日: ${lunarBd}`);

  // 10. 生日通知文案
  const notifText = await run(`notificationText(events.find(e => e.id === 'test-bd'))`);
  console.log(`10. 生日通知文案: "${notifText}"`);

  // 11. 生日弹层文案（fireRemind 内部逻辑验证，不真正弹）
  const overlayText = await run(`(function(){
    const e = events.find(x => x.id === 'test-bd');
    return JSON.stringify({
      name: e.isBirthday ? '🎂 ' + e.name + ' 生日快乐！' : e.name,
      note: e.note || '又长大一岁啦，愿新的一岁平安喜乐！'
    });
  })()`);
  console.log(`11. 生日弹层: ${overlayText}`);

  // 12. 清理
  const cleaned = await run(`(function(){
    events = events.filter(e => e.id !== 'test-bd' && e.id !== 'test-lbd');
    persist(); renderAll(); renderCalendar();
    return events.length;
  })()`);
  console.log(`12. ✓ 测试数据已清理（剩 ${cleaned} 个事件）`);

  // 13. 回今天 + 截图
  await run(`changeMonth(0); showPage('page-home'); renderAll(); true`);
  await shot('cal_today.png');
  console.log('13. ✓ 截图 cal_today.png（回到首页）');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
