// 绸缪 · 云函数 asr —— 腾讯云一句话识别（SentenceRecognition），录音 base64 → 文字
// 密钥来源同 tts：云函数环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 或 config.json
const cloud = require('wx-server-sdk');
const AsrClient = require('tencentcloud-sdk-nodejs').asr.v20190614.Client;

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

let cfg = null;
try{ cfg = require('./config.json'); }catch(e){ cfg = null; }

let _client = null;
function client(){
  if(!_client){
    const secretId = process.env.TENCENT_SECRET_ID || (cfg && cfg.secretId) || '';
    const secretKey = process.env.TENCENT_SECRET_KEY || (cfg && cfg.secretKey) || '';
    if(!secretId || !secretKey) throw new Error('未配置腾讯云密钥（TENCENT_SECRET_ID / TENCENT_SECRET_KEY）');
    _client = new AsrClient({
      credential: { secretId, secretKey },
      region: (cfg && cfg.region) || 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'asr.tencentcloudapi.com' } }
    });
  }
  return _client;
}

exports.main = async (event) => {
  const b64 = String((event && event.audioBase64) || '');
  if(!b64) return { ok: false, error: '未收到音频' };
  // 一句话识别：单句 ≤60s；前端录音上限 30s，足够语音指令使用
  try{
    const res = await client().SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2,          // 2 = 一句话识别
      EngSerViceType: '16k_zh',   // 16k 中文普通话
      SourceLanguageType: 'zh',
      VoiceFormat: String((event && event.format) || 'mp3'),
      UsrAudioKey: 'choumou',
      Data: b64,
      DataLen: Buffer.byteLength(b64, 'base64')
    });
    return { ok: true, text: String(res.Result || '').trim() };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
