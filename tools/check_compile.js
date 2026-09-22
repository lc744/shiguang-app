const automator = require('miniprogram-automator');
(async () => {
  try{
    const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
    const sys = await mp.systemInfo();
    console.log('连接成功 SDKVersion:', sys.SDKVersion);
    // 依次打开关键页，检查是否报错
    for(const route of ['pages/upcoming/upcoming','pages/share/share','pages/me/me']){
      try{
        const page = await (route === 'pages/upcoming/upcoming' || route === 'pages/share/share' || route === 'pages/me/me' ? mp.switchTab('/' + route) : mp.reLaunch('/' + route));
        await new Promise(r => setTimeout(r, 800));
        const p = await mp.currentPage();
        console.log('OK 打开:', p.path);
      }catch(e){ console.log('FAIL 打开:', route, String(e.message || e).slice(0, 120)); }
    }
    // 发布页（非 tab）
    try{ const p = await mp.navigateTo('/pages/share/publish'); await new Promise(r => setTimeout(r, 800)); const c = await mp.currentPage(); console.log('OK 打开:', c.path); await mp.navigateBack(); }catch(e){ console.log('FAIL publish:', String(e.message || e).slice(0, 120)); }
    await mp.disconnect();
    console.log('=== 全部页面检查完毕 ===');
  }catch(e){ console.log('connect fail:', String(e.message || e).slice(0, 200)); process.exit(1); }
})();
