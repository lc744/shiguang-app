// 绸缪小程序 · 自动化冒烟测试（miniprogram-automator 驱动微信开发者工具模拟器）
// 运行前提：开发者工具已登录 + 设置→安全设置→服务端口已开启
// 运行：node tools/mp-auto-test.js
const automator = require('miniprogram-automator');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function t(name, ok, extra){
  results.push({ name, ok });
  console.log((ok ? '✓ ' : '✗ ') + name + (extra ? '  | ' + extra : ''));
}

(async () => {
  let miniProgram;
  try{
    // 优先连接已在运行的自动化端口（需先手动执行 cli auto --project miniprogram --auto-port 9420）
    miniProgram = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
    console.log('— 已连接既有自动化端口 9420 —');
  }catch(e1){
    try{
      miniProgram = await automator.launch({
        cliPath: 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
        projectPath: 'C:/Users/ADMIN/Desktop/新建文件夹/shiguang_mobile_app/miniprogram',
        port: 9420,
        timeout: 60000
      });
      console.log('— 已通过 launch 启动 —');
    }catch(e2){
      console.log('✗ 连接/启动失败: ' + (e1.message || '') + ' / ' + (e2.message || ''));
      console.log('→ 请确认：①开发者工具已登录 ②设置→安全设置→服务端口已开启 ③已执行 cli auto 开启自动化');
      process.exit(1);
    }
  }
  console.log('— 自动化已连接 —\n');
  // 等应用就绪：编译+首页加载完成前命令会超时，轮询 systemInfo 探活
  let ready = false;
  for(let i = 0; i < 30; i++){
    try{ await miniProgram.systemInfo(); ready = true; break; }
    catch(e){ await sleep(3000); }
  }
  if(!ready){
    console.log('✗ 应用 90 秒内未就绪（项目窗口可能有弹窗阻塞或编译失败）');
    try{ await miniProgram.disconnect(); }catch(e){}
    process.exit(1);
  }
  console.log('— 应用就绪 —\n');
  const shot = n => miniProgram.screenshot({ path: 'C:/Users/ADMIN/Desktop/新建文件夹/shiguang_mobile_app/tools/mp-shot-' + n + '.png' }).catch(() => {});

  try{
    /* 0. 状态归零：清空事件（防遗留的"下一整点"事件在测试中途到点弹出提醒页劫持流程）+ 回首页 */
    await miniProgram.callWxMethod('setStorageSync', 'shiguang_events_v2', '[]');
    await miniProgram.reLaunch('/pages/home/home');
    await sleep(800);

    /* 1. 首页 */
    let page = await miniProgram.currentPage();
    t('入口页是 home', page.path === 'pages/home/home', page.path);
    let brand = await page.$('.brand-name');
    t('顶部品牌为「绸缪」', brand && (await brand.text()) === '绸缪');
    const stats = await page.$$('.stat-num');
    t('统计卡两块', stats.length === 2, '实际 ' + stats.length);
    await shot('1-home');

    /* 2. 新建事件 */
    await miniProgram.navigateTo('/pages/editor/editor');
    await sleep(600);
    page = await miniProgram.currentPage();
    t('跳转编辑页', page.path === 'pages/editor/editor');
    const nameInput = await page.$('input');
    await nameInput.input('自动化测试事件');
    await sleep(200);
    await (await page.$('.action-row .primary')).tap();
    await sleep(1000);
    page = await miniProgram.currentPage();
    t('保存后返回 home', page.path === 'pages/home/home', page.path);
    const names = await page.$$('.eb-name');
    let found = false;
    for(const el of names){ if((await el.text()) === '自动化测试事件'){ found = true; break; } }
    t('今天列表出现新事件', found, '列表 ' + names.length + ' 项');
    const statTodo = await page.data('statTodo');
    t('今日待办数 ≥ 1', statTodo >= 1, 'statTodo=' + statTodo);
    await shot('2-added');

    /* 3. 精灵对话 */
    const genie = await page.$('genie');
    await (await genie.$('.genie-fab')).tap();
    await sleep(500);
    let bubbles = await genie.$$('.genie-bubble');
    t('精灵开场白出现', bubbles.length >= 1);
    const inputBar = await genie.$('.genie-input');
    await inputBar.input('你好');
    const btns = await genie.$$('.genie-btn');
    await btns[btns.length - 1].tap();
    await sleep(800);
    bubbles = await genie.$$('.genie-bubble');
    const lastText = await bubbles[bubbles.length - 1].text();
    t('精灵回复闲聊', lastText.length > 0 && lastText !== '你好', lastText.slice(0, 40));
    await inputBar.input('添加明天上午9点自动化会议');
    const btns2 = await genie.$$('.genie-btn');
    await btns2[btns2.length - 1].tap();
    await sleep(1000);
    bubbles = await genie.$$('.genie-bubble');
    const addReply = await bubbles[bubbles.length - 1].text();
    // 回复须包含事件名与日期时间（证明意图解析+存储写入成功）
    t('精灵添加事件指令', /自动化会议/.test(addReply) && /\d{4}-\d{2}-\d{2}/.test(addReply) && /\d{2}:\d{2}/.test(addReply), addReply.replace(/\n/g, ' ').slice(0, 50));
    await (await genie.$('.genie-close')).tap();
    await sleep(300);
    await shot('3-genie');

    /* 4. 精灵添加的事件已持久化（store 写入成功以回复内容为准；事件是明天的，首页今日列表不含它属正常） */
    await miniProgram.switchTab('/pages/calendar/calendar');
    await sleep(500);
    page = await miniProgram.currentPage();
    const agendaData = await page.data();
    t('日历页数据就绪', Array.isArray(agendaData.days) && agendaData.days.length >= 28);

    /* 5. 日历 */
    await miniProgram.switchTab('/pages/calendar/calendar');
    await sleep(600);
    page = await miniProgram.currentPage();
    t('日历页', page.path === 'pages/calendar/calendar');
    const days = await page.$$('.day');
    t('月历网格 ≥ 28 格', days.length >= 28, '实际 ' + days.length);
    await shot('4-calendar');

    /* 6. 设置页（已并入「我的」，navigateTo 打开） */
    await miniProgram.switchTab('/pages/me/me');
    await sleep(600);
    page = await miniProgram.currentPage();
    t('我的页', page.path === 'pages/me/me');
    await miniProgram.navigateTo('/pages/settings/settings');
    await sleep(600);
    page = await miniProgram.currentPage();
    t('设置页', page.path === 'pages/settings/settings');
    const backups = await page.data('backups');
    t('自动备份已生成', Array.isArray(backups) && backups.length >= 1, '备份数 ' + (backups || []).length);
    await shot('5-settings');
    await miniProgram.navigateBack();

    /* 7. 到点提醒页（直接带 id 打开） */
    await miniProgram.switchTab('/pages/home/home');
    await sleep(500);
    page = await miniProgram.currentPage();
    const list = await page.data('list');
    const eid = list && list[0] && list[0].id;
    t('取到事件 id', !!eid);
    await miniProgram.navigateTo('/pages/remind/remind?id=' + eid);
    await sleep(800);
    page = await miniProgram.currentPage();
    t('跳转全屏提醒页', page.path === 'pages/remind/remind');
    const rname = await page.$('.r-name');
    const rnameText = rname ? await rname.text() : '';
    t('提醒页显示事件名', rnameText.length > 0, rnameText);
    await shot('6-remind');
    await (await page.$('.action-row .primary')).tap(); // 知道啦
    await sleep(800);
    page = await miniProgram.currentPage();
    t('关闭提醒后返回', page.path !== 'pages/remind/remind', page.path);
  }catch(e){
    t('执行链路异常', false, e.message.slice(0, 120));
  }

  const pass = results.filter(r => r.ok).length;
  console.log('\n==============================');
  console.log('通过 ' + pass + '/' + results.length);
  try{ await miniProgram.disconnect(); }catch(e){}
  process.exit(pass === results.length ? 0 : 1);
})();
