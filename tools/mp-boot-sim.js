// 绸缪小程序 · 启动模拟器：在 Node 里用 wx 桩跑 app.onLaunch + 各页面 onLoad/onShow
// 目的：抓住自动化测试里"应用不响应"背后的启动期运行时错误
// 运行：node tools/mp-boot-sim.js
const path = require('path');
const ROOT = path.join(__dirname, '..', 'miniprogram');
const req = spec => require(path.join(ROOT, spec));

/* ---------- wx 桩 ---------- */
const storage = {};
const files = {};
global.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageSync: k => (k in storage ? storage[k] : ''),
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: k => { delete storage[k]; },
  getFileSystemManager: () => ({
    copyFileSync: (src, dest) => { files[dest] = src; },
    unlinkSync: p => { delete files[p]; },
    readFileSync: p => files[p] || '',
    writeFileSync: (p, d) => { files[p] = d; }
  }),
  showToast: () => {}, showModal: () => {}, showLoading: () => {}, hideLoading: () => {},
  vibrateShort: () => {}, vibrateLong: () => {},
  createInnerAudioContext: () => ({
    src: '', play(){}, stop(){}, pause(){}, destroy(){},
    onEnded(){}, onError(){}, offEnded(){}, offError(){}, obeyMuteSwitch: true
  }),
  getRecorderManager: () => ({ start(){}, stop(){}, onStop(){}, onError(){}, onStart(){} }),
  chooseMedia: () => {}, setClipboardData: () => {}, getClipboardData: () => {},
  getAppBaseInfo: () => ({ theme: 'light' }),
  getSystemInfoSync: () => ({ theme: 'light', statusBarHeight: 24, windowWidth: 390, windowHeight: 844 }),
  canIUse: () => true,
  nextTick: fn => fn(),
  navigateTo: () => {}, navigateBack: () => {}, switchTab: () => {}, reLaunch: () => {},
  setNavigationBarTitle: () => {}, setNavigationBarColor: () => {},
  startPullDownRefresh: () => {}, stopPullDownRefresh: () => {},
  pageScrollTo: () => {}, createSelectorQuery: () => ({ in(){ return this; }, select(){ return this; }, selectAll(){ return this; }, boundingClientRect(){ return this; }, exec(cb){ cb && cb([]); } }),
  stopRecord: () => {}, getAvailableAudioSources: () => []
};
global.getCurrentPages = () => [];
global.getApp = () => appInstance;   // 页面运行期调用，此时 appInstance 已由 App() 注册
global.getAppBaseInfo = global.wx.getAppBaseInfo;

/* ---------- App / Page / Component 桩 ---------- */
let appInstance = null;
const pageConfigs = [];
const componentConfigs = [];
global.App = cfg => { appInstance = cfg; };
global.Page = cfg => { pageConfigs.push({ cfg, file: currentFile }); };
global.Component = cfg => { componentConfigs.push({ cfg: typeof cfg === 'function' ? cfg({}) : cfg, file: currentFile }); };
global.Behavior = cfg => cfg;
let currentFile = '';

/* ---------- 加载 app.js 与全部页面/组件 ---------- */
const errors = [];
function load(rel){
  currentFile = rel;
  try{ req(rel); console.log('✓ 加载 ' + rel); }
  catch(e){ errors.push('加载 ' + rel + ': ' + e.message); console.log('✗ 加载 ' + rel + ' → ' + e.message); }
}

['app.js'].forEach(load);
const pageFiles = ['pages/home/home','pages/upcoming/upcoming','pages/calendar/calendar','pages/settings/settings','pages/editor/editor','pages/detail/detail','pages/remind/remind'];
pageFiles.forEach(f => load(f + '.js'));
load('components/genie/genie.js');

/* ---------- 运行 app.onLaunch ---------- */
if(appInstance){
  try{
    (appInstance.onLaunch || function(){}).call(appInstance);
    console.log('✓ app.onLaunch');
    if(appInstance.onShow){ appInstance.onShow.call(appInstance); console.log('✓ app.onShow'); }
  }catch(e){ errors.push('app 生命周期: ' + e.message); console.log('✗ app 生命周期 → ' + e.message); }
} else { errors.push('App 未注册'); }

/* ---------- 实例化并跑各页面 onLoad/onShow ---------- */
function makeCtx(cfg){
  const ctx = { data: JSON.parse(JSON.stringify(cfg.data || {})) };
  ctx.setData = (obj) => { Object.assign(ctx.data, obj); };
  Object.keys(cfg).forEach(k => {
    if(typeof cfg[k] === 'function') ctx[k] = cfg[k].bind(ctx);
    else if(!(k in ctx)) ctx[k] = cfg[k];
  });
  return ctx;
}
for(const { cfg, file } of pageConfigs){
  const ctx = makeCtx(cfg);
  try{
    if(cfg.onLoad) cfg.onLoad.call(ctx, {});
    if(cfg.onShow) cfg.onShow.call(ctx);
    console.log('✓ 页面运行 ' + file + '（onLoad+onShow）');
  }catch(e){ errors.push('页面 ' + file + ': ' + e.message); console.log('✗ 页面 ' + file + ' → ' + e.message); }
}
for(const { cfg, file } of componentConfigs){
  const ctx = makeCtx(Object.assign({}, cfg, cfg.methods || {}));
  try{
    if(cfg.lifetimes && cfg.lifetimes.attached) cfg.lifetimes.attached.call(ctx);
    else if(cfg.attached) cfg.attached.call(ctx);
    console.log('✓ 组件运行 ' + file);
  }catch(e){ errors.push('组件 ' + file + ': ' + e.message); console.log('✗ 组件 ' + file + ' → ' + e.message); }
}

console.log('\n==============================');
if(errors.length){ console.log('发现 ' + errors.length + ' 个启动期错误'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('启动模拟全部通过，应用侧无崩溃');
