// 发现用户腾讯云开发（TCB）环境：用备份的 CAM 密钥调 DescribeEnvs（只输出环境信息，绝不输出密钥）
const tcb = require('tencentcloud-sdk-nodejs-tcb').tcb.v20180608;
const secret = require(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json');

const client = new tcb.Client({
  credential: { secretId: secret.secretId, secretKey: secret.secretKey },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com', reqTimeout: 30 } },
});

(async () => {
  const res = await client.DescribeEnvs({ Limit: 20 });
  const envs = (res.EnvList || []).map(e => ({
    envId: e.EnvId, alias: e.Alias || '', status: e.Status,
    source: e.Source || '', region: e.Region || ''
  }));
  console.log(JSON.stringify(envs, null, 2));
  if(!envs.length) console.log('未发现任何云开发环境');
})().catch(e => { console.error('API_ERROR:', e.message || e.code); process.exit(1); });
