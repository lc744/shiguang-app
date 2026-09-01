// 绸缪 · 云函数 tts —— 腾讯云语音合成（TextToVoice），文字 → mp3 base64
// 密钥来源（二选一）：① 云开发控制台给本函数配置环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY
//                    ② 同目录 secret.json（模板 secret.template.json，已 gitignore）
const cloud = require('wx-server-sdk');
const TtsClient = require('tencentcloud-sdk-nodejs').tts.v20190823.Client;

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

let cfg = null;
try{ cfg = require('./secret.json'); }catch(e){ cfg = null; }

let _client = null;
function client(){
  if(!_client){
    const secretId = process.env.TENCENT_SECRET_ID || (cfg && cfg.secretId) || '';
    const secretKey = process.env.TENCENT_SECRET_KEY || (cfg && cfg.secretKey) || '';
    if(!secretId || !secretKey) throw new Error('未配置腾讯云密钥（TENCENT_SECRET_ID / TENCENT_SECRET_KEY）');
    _client = new TtsClient({
      credential: { secretId, secretKey },
      region: (cfg && cfg.region) || 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'tts.tencentcloudapi.com' } }
    });
  }
  return _client;
}

exports.main = async (event) => {
  const text = String((event && event.text) || '').trim().slice(0, 150);
  if(!text) return { ok: false, error: '文本为空' };
  try{
    const res = await client().TextToVoice({
      Text: text,
      SessionId: 'choumou-' + Date.now(),
      ModelType: 1,                                        // 1 = 基础音库（免费额度适用）
      VoiceType: Number(process.env.TTS_VOICE_TYPE || (cfg && cfg.voiceType) || 0), // 0 = 智瑜·亲和女声
      PrimaryLanguage: 1,                                  // 1 = 中文
      SampleRate: 16000,
      Codec: 'mp3'
    });
    if(!res.Audio) return { ok: false, error: '合成结果为空' };
    return { ok: true, audioBase64: res.Audio };
  }catch(e){
    return { ok: false, error: String((e && e.message) || e) };
  }
};
