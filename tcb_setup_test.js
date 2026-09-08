// 用管理 SDK 实测：数据库访问 / 登录方式状态 / 现有用户
const CloudBase = require('@cloudbase/manager-node');
const secret = require(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json');
const ENV_ID = 'gerenceshi-d0gguq5u39b4b86b2';

const app = CloudBase.init({ secretId: secret.secretId, secretKey: secret.secretKey, envId: ENV_ID, region: 'ap-shanghai' });

(async () => {
  // 1. 数据库：检查/创建 users 集合
  try{
    const exists = await app.database.checkCollectionExists('users');
    console.log('users 集合存在:', !!exists.Exists);
    if(!exists.Exists){
      await app.database.createCollection('users');
      console.log('users 集合已创建');
    }
  }catch(e){ console.log('数据库操作失败:', String(e.message || e).slice(0, 150)); }

  // 2. 登录方式状态
  try{
    const r = await app.commonService('auth').call({ Action: 'DescribeLoginMethods', Param: {} });
    console.log('登录方式:', JSON.stringify(r).slice(0, 600));
  }catch(e){ console.log('DescribeLoginMethods 失败:', String(e.message || e).slice(0, 150)); }

  // 3. 现有终端用户
  try{
    const r = await app.user.describeUserList({ Limit: 5 });
    console.log('现有用户数:', (r.Users || []).length, r.Total ? '(共 ' + r.Total + ')' : '');
  }catch(e){ console.log('describeUserList 失败:', String(e.message || e).slice(0, 150)); }
})().catch(e => { console.error('ERR:', String(e.message || e).slice(0, 200)); process.exit(1); });
