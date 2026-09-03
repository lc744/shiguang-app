// 小程序端 → 云开发 → 腾讯云 全链路 E2E 测试
// 前置：IDE 已通过 cli auto 开启自动化（9420），云函数 tts/asr 已部署
const automator = require('miniprogram-automator');

// 生成 1 秒 440Hz 蜂鸣 WAV（测试音频，无需真实人声）
function beepWavB64(){
  const SR = 16000, total = SR;
  const pcm = Buffer.alloc(total * 2);
  for(let i = 0; i < total; i++){ pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / SR) * 12000), i * 2); }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([hdr, pcm]).toString('base64');
}

(async () => {
  let mp;
  try{
    mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  }catch(e){
    console.log('✗ 连接失败：' + e.message + '（先执行 cli auto 开启自动化）');
    process.exit(1);
  }
  for(let i = 0; i < 20; i++){
    try{ await mp.systemInfo(); break; }catch(e){ await new Promise(r => setTimeout(r, 3000)); }
  }

  console.log('— 小程序内 wx.cloud 链路测试 —');

  // 1) TTS：文字 → 云函数 → 腾讯云语音合成（文本带时间戳绕开客户端缓存，确保测到当前密钥）
  const stamp = new Date().toISOString().slice(11, 19);
  const ttsRes = await mp.evaluate(txt => new Promise(resolve => {
    if(!wx.cloud){ resolve({ ok: false, error: 'wx.cloud 不存在' }); return; }
    wx.cloud.callFunction({ name: 'tts', data: { text: txt } })
      .then(r => resolve(r.result))
      .catch(e => resolve({ ok: false, error: String(e.errMsg || e.message || e) }));
  }), '密钥轮换验证' + stamp + '，链路正常');
  if(ttsRes && ttsRes.ok && ttsRes.audioBase64){
    console.log('✓ TTS 云函数：合成 mp3 ' + Math.round(ttsRes.audioBase64.length * 3 / 4 / 1024) + ' KB');
  } else {
    console.log('✗ TTS 云函数：' + ((ttsRes && ttsRes.error) || JSON.stringify(ttsRes).slice(0, 120)));
  }

  // 2) ASR：蜂鸣音频 → 云函数 → 腾讯云一句话识别
  const asrRes = await mp.evaluate(b64 => new Promise(resolve => {
    wx.cloud.callFunction({ name: 'asr', data: { audioBase64: b64, format: 'wav' } })
      .then(r => resolve(r.result))
      .catch(e => resolve({ ok: false, error: String(e.errMsg || e.message || e) }));
  }), beepWavB64());
  if(asrRes && asrRes.ok){
    console.log('✓ ASR 云函数：接口通（蜂鸣无语音，Result="' + String(asrRes.text || '') + '" 为正常）');
  } else {
    console.log('✗ ASR 云函数：' + ((asrRes && asrRes.error) || JSON.stringify(asrRes).slice(0, 120)));
  }

  const pass = ttsRes && ttsRes.ok && asrRes && asrRes.ok;
  console.log('\n' + (pass ? '✓✓ 云端语音链路全通，小程序端就绪' : '存在未通过项，见上'));
  try{ await mp.disconnect(); }catch(e){}
  process.exit(pass ? 0 : 1);
})();
