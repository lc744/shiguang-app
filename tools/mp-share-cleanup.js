// 清理云数据库中的测试发布（DIAG店 / UI测试推荐店 / E2E打卡测试店 / 标记健康检查等）
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PATTERNS = [/^DIAG店/, /^UI测试推荐店/, /^E2E打卡测试店/, /^UI测试/];

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  for(let i = 0; i < 20; i++){ try{ await mp.systemInfo(); break; }catch(e){ await sleep(3000); } }
  const call = (name, data) => mp.evaluate(new Function(
    'return new Promise((res, rej) => wx.cloud.callFunction({ name: ' + JSON.stringify(name) +
    ', data: ' + JSON.stringify(data) + ' }).then(r => res(r.result)).catch(e => rej(String(e && e.message || e))));'
  ));
  const m = await call('postApi', { action: 'mine' });
  if(!m.ok){ console.log('mine 失败: ' + JSON.stringify(m)); process.exit(1); }
  let n = 0;
  for(const p of m.list){
    if(PATTERNS.some(rx => rx.test(p.name))){
      await call('postApi', { action: 'del', id: p._id });
      n++;
      console.log('已清理: ' + p.name);
    }
  }
  console.log('清理完成，共 ' + n + ' 条；剩余 ' + (m.list.length - n) + ' 条');
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
