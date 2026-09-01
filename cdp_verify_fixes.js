// 验证两个 BUG 修复：1) 9月日历格子宽度统一 2) 吸顶 header 遮住状态栏
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

  console.log('=== BUG 1 验证：9 月格子宽度 ===\n');

  // 1. 2026-09 每列宽度
  const sep = await run(`(function(){
    showPage('page-calendar');
    calYear = 2026; calMonth = 8; renderCalendar();
    const cells = [...document.getElementById('daysGrid').querySelectorAll('.day')];
    const colW = {};
    cells.forEach((c, i) => {
      const col = i % 7;
      const w = Math.round(c.getBoundingClientRect().width);
      if(!colW[col]) colW[col] = [];
      colW[col].push(w);
    });
    // 9月3日的格子内容
    const sep3 = cells.find(c => { const s = c.querySelector('span'); return s && s.textContent === '3'; });
    return JSON.stringify({
      cols: Object.keys(colW).map(k => k + ':' + Math.max(...colW[k])).join(' | '),
      allEqual: Object.values(colW).every(arr => Math.max(...arr) === Math.min(...colW[0])),
      sep3Text: sep3 ? sep3.querySelector('small').textContent : '',
      sep3W: sep3 ? Math.round(sep3.getBoundingClientRect().width) : 0,
      docOverflow: document.documentElement.scrollWidth > window.innerWidth
    });
  })()`);
  const s1 = JSON.parse(sep);
  console.log(`各列宽度: ${s1.cols}`);
  console.log(`列宽统一: ${s1.allEqual ? '✓' : '✗'}`);
  console.log(`9月3日显示: "${s1.sep3Text}" (格宽 ${s1.sep3W}px)`);
  console.log(`文档水平溢出: ${s1.docOverflow ? '✗ 有' : '✓ 无'}`);

  // 2. 2025-09 / 2027-09 同样验证
  for(const [y, m] of [[2025, 8], [2027, 8]]){
    const r = await run(`(function(){
      calYear = ${y}; calMonth = ${m}; renderCalendar();
      const cells = [...document.getElementById('daysGrid').querySelectorAll('.day')];
      const ws2 = cells.map(c => Math.round(c.getBoundingClientRect().width));
      const uniq = [...new Set(ws2)];
      return JSON.stringify({ y: ${y}, widths: uniq.join(','), uniform: uniq.length === 1 });
    })()`);
    const d = JSON.parse(r);
    console.log(`${d.y}-09: 格宽=[${d.widths}] 统一=${d.uniform ? '✓' : '✗'}`);
  }

  // 3. 胜利日节日判定仍正常
  const fest = await run(`festivalOf('2026-09-03')`);
  console.log(`2026-09-03 节日: "${fest}" ${fest === '胜利日' ? '✓' : '✗'}`);

  console.log('\n=== BUG 2 验证：吸顶 header ===\n');

  // 4. 回首页，初始状态
  const init = await run(`(function(){
    showPage('page-home');
    window.scrollTo(0, 0);
    return new Promise(res => setTimeout(() => {
      const h = document.querySelector('.header').getBoundingClientRect();
      res(JSON.stringify({
        top: Math.round(h.top), height: Math.round(h.height),
        safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
        headerPadTop: getComputedStyle(document.querySelector('.header')).paddingTop,
        position: getComputedStyle(document.querySelector('.header')).position
      }));
    }, 300));
  })()`);
  const i4 = JSON.parse(init);
  console.log(`初始: position=${i4.position} top=${i4.top} 高=${i4.height}px`);
  console.log(`--safe-top="${i4.safeTop.trim()}" header padding-top=${i4.headerPadTop}`);

  // 5. 滚动 400px 后 header 应仍固定在 top=0
  const scrolled = await run(`(function(){
    window.scrollTo(0, 400);
    return new Promise(res => setTimeout(() => {
      const h = document.querySelector('.header').getBoundingClientRect();
      const hero = document.querySelector('.hero').getBoundingClientRect();
      res(JSON.stringify({
        headerTop: Math.round(h.top), headerH: Math.round(h.height),
        heroTop: Math.round(hero.top), // hero 应该滚到 header 之下（负值或被遮住）
        covered: h.top === 0 && hero.top >= h.bottom - 5 || hero.top < h.bottom
      }));
    }, 400));
  })()`);
  const s5 = JSON.parse(scrolled);
  console.log(`滚动400px后: header top=${s5.headerTop} (应为0) 高=${s5.headerH}px`);
  console.log(`hero top=${s5.heroTop}px（已滚到 header 区域内/下方）`);
  console.log(`header 吸顶遮盖: ${s5.headerTop === 0 ? '✓' : '✗'}`);

  // 6. 状态栏区域检查：header 顶 padding 覆盖状态栏高度
  const st = await run(`(async function(){
    const h = document.querySelector('.header');
    const padTop = parseFloat(getComputedStyle(h).paddingTop);
    const safeTopPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
    let nativeTop = 0;
    try{ if(window.__getStatusBarHeight) nativeTop = (await window.__getStatusBarHeight()) / (window.devicePixelRatio || 1); }catch(e){}
    return JSON.stringify({ padTop: Math.round(padTop), safeTopPx: Math.round(safeTopPx), nativeTop: Math.round(nativeTop), coversStatusBar: padTop >= nativeTop - 2 });
  })()`);
  const s6 = JSON.parse(st);
  console.log(`header 顶部内边距: ${s6.padTop}px ≥ 状态栏高度 ${s6.nativeTop}px: ${s6.coversStatusBar ? '✓' : '✗'}`);

  // 7. 滚回顶部恢复正常
  await run(`window.scrollTo(0, 0); true`);
  console.log('\n✓ 验证完成');

  ws.close();
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
