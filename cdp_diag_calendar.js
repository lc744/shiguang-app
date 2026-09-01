// 诊断 BUG1：逐月测量日历布局是否溢出
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
    pending[myId] = m => {
      if(m.result && m.result.exceptionDetails){
        resolve(JSON.stringify({__err: m.result.exceptionDetails.exception ? m.result.exceptionDetails.exception.description : 'unknown'}));
      } else {
        resolve(m.result && m.result.result ? m.result.result.value : null);
      }
    };
    ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });

  await run(`showPage('page-calendar'); true`);
  console.log('视口宽度:', await run(`window.innerWidth + ' x ' + window.innerHeight`));

  // 逐月测量 2025-2028 全部月份
  const months = [];
  for(const y of [2025, 2026, 2027, 2028]){
    for(let m = 0; m < 12; m++) months.push([y, m]);
  }
  const broken = [];
  for(const [y, m] of months){
    const r = await run(`(function(){
      try{
      calYear = ${y}; calMonth = ${m}; renderCalendar();
      const doc = document.documentElement;
      const days = document.getElementById('daysGrid');
      const cells = [...days.querySelectorAll('.day')];
      const winW = window.innerWidth;
      let maxRight = 0, minLeft = 9999, tallest = 0, widest = 0;
      for(const c of cells){
        const r2 = c.getBoundingClientRect();
        if(r2.right > maxRight) maxRight = r2.right;
        if(r2.left < minLeft) minLeft = r2.left;
        if(r2.height > tallest) tallest = r2.height;
        if(r2.width > widest) widest = r2.width;
      }
      const monthCard = document.querySelector('.month-card').getBoundingClientRect();
      return JSON.stringify({
        docScrollW: doc.scrollWidth, winW: winW,
        horizOverflow: doc.scrollWidth > winW,
        cellCount: cells.length, maxRight: Math.round(maxRight),
        overflowViewport: maxRight > winW, cellW: Math.round(widest), cellH: Math.round(tallest),
        cardW: Math.round(monthCard.width), cardRight: Math.round(monthCard.right)
      });
      }catch(e){ return JSON.stringify({__err: e.message + ' | ' + (e.stack||'').split('\\n')[1]}); }
    })()`);
    if(!r){ console.log(`${y}-${m+1}: 返回 null`); continue; }
    if(r.startsWith && r.startsWith('{"__err"')){ console.log(`${y}-${m+1} 报错: ${r}`); continue; }
    const d = JSON.parse(r);
    if(d.horizOverflow || d.overflowViewport){
      broken.push(`${y}-${String(m+1).padStart(2,'0')}: docScroll=${d.docScrollW}/${d.winW} 格子最右=${d.maxRight} 格数=${d.cellCount} 格宽=${d.cellW} 格高=${d.cellH}`);
    }
  }
  if(broken.length){ console.log('溢出月份:'); broken.forEach(b => console.log('  ' + b)); }
  else { console.log('所有 2025-2028 月份无水平溢出'); }

  // 重点细查 2026-09: 每个格子的位置和内容
  console.log('\n=== 2026-09 细查 ===');
  const sep = await run(`(function(){
    calYear = 2026; calMonth = 8; renderCalendar();
    const days = document.getElementById('daysGrid');
    const cells = [...days.querySelectorAll('.day')];
    const grid = days.getBoundingClientRect();
    const out = { gridLeft: Math.round(grid.left), gridRight: Math.round(grid.right), gridW: Math.round(grid.width), winW: window.innerWidth, cells: [] };
    cells.forEach((c, i) => {
      const r2 = c.getBoundingClientRect();
      const small = c.querySelector('small');
      const span = c.querySelector('span');
      const mark = c.querySelector('.day-mark');
      out.cells.push({
        i: i, text: span ? span.textContent : '', sub: small ? small.textContent : '',
        mark: mark ? mark.textContent : '',
        left: Math.round(r2.left), right: Math.round(r2.right), top: Math.round(r2.top), h: Math.round(r2.height), w: Math.round(r2.width),
        subW: small ? Math.round(small.getBoundingClientRect().width) : 0,
        subScrollW: small ? small.scrollWidth : 0
      });
    });
    return JSON.stringify(out);
  })()`);
  const s = JSON.parse(sep);
  console.log(`网格: left=${s.gridLeft} right=${s.gridRight} 宽=${s.gridW} / 视口=${s.winW}`);
  console.log('格数:', s.cells.length);
  // 只列出有问题的格子（超出视口或 sub 被裁剪）
  s.cells.filter(c => c.right > s.winW || c.subScrollW > c.subW + 2 || c.w > 60 || c.h > 60).forEach(c =>
    console.log(`  格[${c.i}] "${c.text}/${c.sub}" mark="${c.mark}" pos=(${c.left}~${c.right}) w=${c.w} h=${c.h} subW=${c.subW}/${c.subScrollW}`)
  );
  // 议程标题长度
  const agenda = await run(`(function(){
    const h = document.getElementById('agendaTitle');
    const r2 = h.getBoundingClientRect();
    const sub = document.querySelector('#page-calendar .subhead');
    const sr = sub.getBoundingClientRect();
    return JSON.stringify({ title: h.textContent, titleW: Math.round(r2.width), subheadW: Math.round(sr.width), scrollW: document.documentElement.scrollWidth, winW: window.innerWidth });
  })()`);
  console.log('议程标题:', agenda);

  // 恢复今天
  await run(`changeMonth(0); showPage('page-home'); renderAll(); true`);
  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
