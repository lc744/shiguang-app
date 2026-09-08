// 配置 TCB Web 安全域名：查看现有 + 添加 GitHub Pages 与 Capacitor 本地域
const tcb = require('tencentcloud-sdk-nodejs-tcb').tcb.v20180608;
const secret = require(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json');
const ENV_ID = 'gerenceshi-d0gguq5u39b4b86b2';

const client = new tcb.Client({
  credential: { secretId: secret.secretId, secretKey: secret.secretKey },
  region: 'ap-shanghai',
  profile: { httpProfile: { endpoint: 'tcb.tencentcloudapi.com', reqTimeout: 30 } },
});

(async () => {
  const cur = await client.DescribeAuthDomains({ EnvId: ENV_ID });
  const have = (cur.Domains || []).map(d => d.Domain);
  console.log('现有域名:', JSON.stringify(have));
  const want = ['lc744.github.io', 'localhost'];
  for(const d of want){
    if(have.includes(d)){ console.log('已存在:', d); continue; }
    try{
      await client.CreateAuthDomain({ EnvId: ENV_ID, Domains: [d] });
      console.log('已添加:', d);
    }catch(e){
      console.log('添加失败:', d, '-', e.message || e.code);
    }
  }
  const after = await client.DescribeAuthDomains({ EnvId: ENV_ID });
  console.log('最终域名:', JSON.stringify((after.Domains || []).map(d => d.Domain)));
})().catch(e => { console.error('API_ERROR:', e.message || e.code); process.exit(1); });
