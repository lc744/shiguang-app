// 测试 CAM 密钥对 TCB 环境 SCF 云函数的管理权限 + SES 邮件服务权限
const scf = require('tencentcloud-sdk-nodejs-scf').scf.v20180416;
const secret = require(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json');
const ENV_ID = 'gerenceshi-d0gguq5u39b4b86b2';

const client = new scf.Client({
  credential: { secretId: secret.secretId, secretKey: secret.secretKey },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com', reqTimeout: 30 } },
});

(async () => {
  // 1. 云函数列表
  try{
    const res = await client.ListFunctions({ Namespace: ENV_ID, Limit: 20 });
    console.log('SCF 权限: OK，函数列表:');
    (res.Functions || []).forEach(f => console.log('  -', f.FunctionName, '|', f.Runtime, '|', f.Status));
  }catch(e){ console.log('SCF ListFunctions 失败:', e.code || e.message); }

  // 2. SES 邮件推送权限
  try{
    const ses = require('tencentcloud-sdk-nodejs-ses').ses.v20201002;
    const sc = new ses.Client({
      credential: { secretId: secret.secretId, secretKey: secret.secretKey },
      region: 'ap-hongkong',
      profile: { httpProfile: { endpoint: 'ses.tencentcloudapi.com', reqTimeout: 30 } },
    });
    const d = await sc.DescribeSenderStatus ? await sc.DescribeSenderStatus({}) : null;
    console.log('SES 权限: OK');
  }catch(e){
    const msg = String(e.code || e.message);
    console.log('SES 权限:', msg.includes('AuthFailure') || msg.includes('not supported') ? '无权限(未开通)' : msg.slice(0, 80));
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
