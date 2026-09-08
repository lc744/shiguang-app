// 部署 profileApi 函数到 TCB 环境（SCF CreateFunction + 云接入自动路由）
const scf = require('tencentcloud-sdk-nodejs-scf').scf.v20180416;
const fs = require('fs');
const path = require('path');
const secret = require(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json');
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';
const REGION = 'ap-shanghai';

const c = new scf.Client({
  credential: { secretId: secret.secretId, secretKey: secret.secretKey },
  region: REGION,
  profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com', reqTimeout: 120 } },
});

(async () => {
  const zipB64 = fs.readFileSync(path.join(process.env.TEMP, 'profileApi_b64.txt'), 'utf8');
  const params = {
    FunctionName: 'shiguang-profile-api',
    Namespace: 'default',
    Type: 'HTTP',
    Runtime: 'Nodejs16.13',
    Handler: 'index.main',
    MemorySize: 256,
    Timeout: 20,
    Description: '绸缪-用户资料API(管理users集合+验证新认证token)',
    InstallDependency: 'FALSE',
    Environment: {
      Variables: [
        { Key: 'TCB_SECRET_ID', Value: secret.secretId },
        { Key: 'TCB_SECRET_KEY', Value: secret.secretKey },
      ],
    },
    Code: { ZipFile: zipB64 },
  };
  try{
    const r = await c.CreateFunction(params);
    console.log('CreateFunction OK:', JSON.stringify(r).slice(0, 300));
  }catch(e){
    if(/ResourceInUse|FunctionNameConflict|already exist/i.test(String(e.code || '') + e.message)){
      console.log('函数已存在 → 更新代码');
      try{
        await c.UpdateFunctionCode({ FunctionName: 'shiguang-profile-api', Namespace: 'default', ZipFile: zipB64 });
        console.log('UpdateFunctionCode OK');
        await new Promise(r => setTimeout(r, 5000));
        await c.UpdateFunctionConfiguration({ FunctionName: 'shiguang-profile-api', Namespace: 'default', Timeout: 20, MemorySize: 256, Environment: { Variables: [ { Key: 'TCB_SECRET_ID', Value: secret.secretId }, { Key: 'TCB_SECRET_KEY', Value: secret.secretKey } ] } });
        console.log('UpdateFunctionConfiguration OK');
      }catch(e2){ console.error('更新失败:', String(e2.message || e2).slice(0, 200)); process.exit(1); }
    } else {
      console.error('CreateFunction ERR:', e.code || '', String(e.message || e).slice(0, 300));
      process.exit(1);
    }
  }
  // 等待就绪
  for(let i = 0; i < 30; i++){
    await new Promise(r => setTimeout(r, 4000));
    try{
      const st = await c.GetFunction({ FunctionName: 'shiguang-profile-api', Namespace: 'default' });
      console.log('状态:', st.Status, '| URL:', st.FunctionUrl || st.Triggers ? JSON.stringify(st.Triggers || {}).slice(0, 200) : '', st.StatusReason || '');
      if(st.Status === 'Active'){ console.log('FunctionUrl:', st.FunctionUrl || '(见 Triggers)'); break; }
      if(st.Status === 'Failed'){ console.error('部署失败'); process.exit(1); }
    }catch(e){ console.log('查询中...', String(e.message).slice(0, 60)); }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
