// ASR 单项测试：本地合成 1.5 秒测试音（正弦波 WAV）→ SentenceRecognition
// 目的：区分「服务/资源包问题」和「正常无语音」，确认 ASR 可用性
const fs = require('fs');
const path = require('path');
const keys = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'asr', 'secret.json'), 'utf8'));
const tencentcloud = require(path.join(__dirname, 'tc-test', 'node_modules', 'tencentcloud-sdk-nodejs'));
const AsrClient = tencentcloud.asr.v20190614.Client;

// 生成 16kHz 16bit 单声道 WAV：0.2s 静音 + 1.1s 440Hz 正弦 + 0.2s 静音
const SR = 16000;
const total = Math.floor(SR * 1.5);
const pcm = Buffer.alloc(total * 2);
for(let i = 0; i < total; i++){
  const inBeep = i > SR * 0.2 && i < SR * 1.3;
  const v = inBeep ? Math.round(Math.sin(2 * Math.PI * 440 * i / SR) * 12000) : 0;
  pcm.writeInt16LE(v, i * 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
const wav = Buffer.concat([hdr, pcm]);

(async () => {
  try{
    const asr = new AsrClient({
      credential: { secretId: keys.secretId, secretKey: keys.secretKey },
      region: keys.region || 'ap-guangzhou'
    });
    const r = await asr.SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: '16k_zh',
      SourceType: 1,              // 1 = 音频内容在 Data 参数里（实测：0 是 URL 模式）
      VoiceFormat: 'wav',
      UsrAudioKey: 'choumou-test',
      Data: wav.toString('base64'),
      DataLen: wav.length
    });
    console.log('✓ ASR 接口调用成功（Result="' + String(r.Result || '') + '"，测试音无语音，空结果是正常的）');
    console.log('✓ 语音识别服务可用，额度没问题');
  }catch(e){
    console.log('✗ ASR 调用失败：' + e.message);
    if(/resource pack|exhausted/i.test(e.message)) console.log('→ ASR 也需要领取/购买资源包');
    else if(/activated|开通|AuthFailure/i.test(e.message)) console.log('→ ASR 服务未开通');
  }
})();
