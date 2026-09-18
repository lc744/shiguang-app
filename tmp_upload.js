// 上传语音包到 TCB 云存储
const CloudBase = require('@cloudbase/manager-node');
const fs = require('fs');
const path = require('path');
const secrets = JSON.parse(fs.readFileSync('cloud_secrets.json', 'utf8'));
const app = new CloudBase({ secretId: secrets.secretId, secretKey: secrets.secretKey, envId: 'gerenceshi-d0gguq5u39b4b86b2' });

const files = [
  ['kokoro.tar.bz2', 'voice-packs/kokoro-int8-multi-lang-v1_0.tar.bz2'],
  ['melo.tar.bz2', 'voice-packs/vits-melo-tts-zh_en.tar.bz2'],
  ['matcha.tar.bz2', 'voice-packs/matcha-icefall-zh-baker.tar.bz2'],
  ['vocos.onnx', 'voice-packs/vocos-22khz-univ.onnx'],
];

(async () => {
  for(const [local, cloud] of files){
    const p = path.join(process.env.TEMP, 'shiguang-packs', local);
    const mb = (fs.statSync(p).size / 1048576).toFixed(1);
    process.stdout.write('uploading ' + local + ' (' + mb + 'MB) ... ');
    await app.storage.uploadFile({ localPath: p, cloudPath: cloud });
    console.log('OK -> ' + cloud);
  }
  console.log('ALL UPLOADED');
})().catch(e => { console.error('FAIL: ' + (e && e.message || e)); process.exit(1); });
