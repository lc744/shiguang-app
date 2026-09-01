// 腾讯云语音 API 本地往返测试（不依赖小程序/云函数，直接验证密钥与服务开通状态）
// TTS：TextToVoice 合成一句话 → ASR：SentenceRecognition 识别回来 → 对比
// 密钥读取自 cloudfunctions/tts/secret.json（已 gitignore，不入库）
const fs = require('fs');
const path = require('path');
const keys = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'tts', 'secret.json'), 'utf8'));

const tencentcloud = require(path.join(__dirname, 'tc-test', 'node_modules', 'tencentcloud-sdk-nodejs'));
const TtsClient = tencentcloud.tts.v20190823.Client;
const AsrClient = tencentcloud.asr.v20190614.Client;

(async () => {
  let audioB64 = '';
  // —— 1. 语音合成 ——
  try{
    const tts = new TtsClient({
      credential: { secretId: keys.secretId, secretKey: keys.secretKey },
      region: keys.region || 'ap-guangzhou'
    });
    const r = await tts.TextToVoice({
      Text: '你好，我是绸缪精灵，今天记得喝水',
      SessionId: 'choumou-test-' + Date.now(),
      ModelType: 1,
      VoiceType: Number(keys.voiceType || 0),
      PrimaryLanguage: 1,
      SampleRate: 16000,
      Codec: 'mp3'
    });
    if(r.Audio && r.Audio.length > 1000){
      audioB64 = r.Audio;
      console.log('✓ 语音合成通过：返回 mp3 ' + Math.round(Buffer.byteLength(r.Audio, 'base64') / 1024) + ' KB');
    } else {
      console.log('✗ 语音合成异常：Audio 为空');
      process.exit(1);
    }
  }catch(e){
    console.log('✗ 语音合成失败：' + e.message);
    if(/not (been )?activated|开通|Unauthorized|AuthFailure/i.test(e.message)) console.log('→ 语音合成服务可能未开通，去 console.cloud.tencent.com/tts 点立即开通');
    process.exit(1);
  }

  // —— 2. 语音识别（用刚才合成的音频） ——
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
      VoiceFormat: 'mp3',
      UsrAudioKey: 'choumou-test',
      Data: audioB64,
      DataLen: Buffer.byteLength(audioB64, 'base64')
    });
    const text = String(r.Result || '').trim();
    if(text){
      console.log('✓ 语音识别通过：识别结果「' + text + '」');
      const ok = /你好|绸缪|精灵|喝水/.test(text);
      console.log(ok ? '✓ 往返校验通过（内容吻合）' : '△ 往返内容不完全吻合，但识别链路已通');
    } else {
      console.log('✗ 语音识别异常：Result 为空');
      process.exit(1);
    }
  }catch(e){
    console.log('✗ 语音识别失败：' + e.message);
    if(/not (been )?activated|开通|Unauthorized|AuthFailure/i.test(e.message)) console.log('→ 语音识别服务可能未开通，去 console.cloud.tencent.com/asr 点立即开通');
    process.exit(1);
  }
})();
