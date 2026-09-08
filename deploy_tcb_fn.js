// 一次性脚本：经 @cloudbase/manager-node 创建 profileApi 云函数（走 TCB 官方部署通道）
const CloudBase = require('@cloudbase/manager-node');
const fs = require('fs');
const path = require('path');

const sec = JSON.parse(fs.readFileSync(process.env.TEMP + '/shiguang_secrets_bak/asr_secret.json', 'utf8'));
const ENV = 'gerenceshi-d0gguq5u39b4b86b2';

(async () => {
  const app = new CloudBase({
    secretId: sec.secretId,
    secretKey: sec.secretKey,
    envId: ENV,
    region: 'ap-shanghai',
  });
  try {
    await app.functions.createFunction({
      func: {
        name: 'profileApi',
        runtime: 'Nodejs16.13',
        timeout: 20,
        memorySize: 256,
        installDependency: true,
        handler: 'index.main',
        envVariables: {
          TCB_SECRET_ID: sec.secretId,
          TCB_SECRET_KEY: sec.secretKey,
        },
      },
      functionRootPath: path.join(__dirname, 'function'),
      deployMode: 'zip',
      force: true,
    });
    console.log('函数创建成功!');
  } catch (e) {
    console.error('创建失败:', e.code || '', String(e.message).slice(0, 250));
    process.exit(1);
  }
})();
