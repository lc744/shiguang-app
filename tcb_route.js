// 绸缪 · 云接入路由配置（profileApi 函数部署后运行）
// 将默认域名 /profileApi 路径绑定到 profileApi 云函数
const tcb = require('tencentcloud-sdk-nodejs-tcb').tcb.v20180608;
const secret = require(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json');
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
const DOMAIN = ENV + '-1479056464.tcloudbaseapp.com';
const REGION = 'ap-shanghai';

const c = new tcb.Client({
  credential: { secretId: secret.secretId, secretKey: secret.secretKey },
  region: REGION,
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com', reqTimeout: 30 } },
});

(async () => {
  // 1. 检查函数是否已部署（微信开发者工具上传后可见）
  const scf = require('tencentcloud-sdk-nodejs-scf').scf.v20180416;
  const scfClient = new scf.Client({
    credential: { secretId: secret.secretId, secretKey: secret.secretKey },
    region: REGION,
    profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com', reqTimeout: 30 } },
  });
  let fnActive = false;
  try{
    const fn = await scfClient.GetFunction({ FunctionName: 'profileApi', Namespace: ENV });
    fnActive = fn.Status === 'Active';
    console.log('profileApi 函数状态:', fn.Status);
  }catch(e){
    console.log('profileApi 函数不可见:', String(e.message).slice(0, 80));
    console.log('→ 请先在微信开发者工具中右键 cloudfunctions/profileApi → 上传并部署：云端安装依赖');
    process.exit(2);
  }
  if(!fnActive){ console.log('函数未就绪'); process.exit(2); }

  // 2. 绑定路由
  try{
    await c.CreateHTTPServiceRoute({
      EnvId: ENV,
      Domain: { Domain: DOMAIN, Routes: [ { Path: '/profileApi', UpstreamResourceType: 'SCF', UpstreamResourceName: 'profileApi', Enable: true } ] },
    });
    console.log('路由已创建: https://' + DOMAIN + '/profileApi');
  }catch(e){
    if(/exist|already/i.test(String(e.message || e))){
      console.log('路由已存在，尝试更新');
      try{
        await c.ModifyHTTPServiceRoute({
          EnvId: ENV,
          Domain: { Domain: DOMAIN, Routes: [ { Path: '/profileApi', UpstreamResourceType: 'SCF', UpstreamResourceName: 'profileApi', Enable: true } ] },
        });
        console.log('路由已更新');
      }catch(e2){ console.error('更新失败:', String(e2.message || e2).slice(0, 140)); process.exit(1); }
    } else {
      console.error('路由创建失败:', e.code || '', String(e.message || e).slice(0, 140));
      process.exit(1);
    }
  }

  // 3. 验证路由可达
  await new Promise(r => setTimeout(r, 8000));
  const https = require('https');
  await new Promise((resolve) => {
    const req = https.request('https://' + DOMAIN + '/profileApi', { method: 'OPTIONS' }, (res) => {
      console.log('路由探测:', res.statusCode, '| CORS:', res.headers['access-control-allow-origin'] || '(无)');
      resolve();
    });
    req.on('error', (e) => { console.log('路由探测: ERR', e.code); resolve(); });
    req.end();
  });
  console.log('完成。前端 PROFILE_URL 已指向此地址。');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
