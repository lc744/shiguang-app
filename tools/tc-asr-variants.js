// ASR 参数变体实验：定位 SourceType 传递问题
const fs = require('fs');
const path = require('path');
const keys = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'asr', 'secret.json'), 'utf8'));
const tencentcloud = require(path.join(__dirname, 'tc-test', 'node_modules', 'tencentcloud-sdk-nodejs'));
const AsrClient = tencentcloud.asr.v20190614.Client;

const SR = 16000;
const total = Math.floor(SR * 1.0);
const pcm = Buffer.alloc(total * 2);
for(let i = 0; i < total; i++){ pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / SR) * 12000), i * 2); }
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
const wav = Buffer.concat([hdr, pcm]);

const variants = [
  { name: 'D: SourceType=1 + Data（URL=0/Data=1 约定）', p: { ProjectId: 0, SubServiceType: 2, EngSerViceType: '16k_zh', SourceType: 1, VoiceFormat: 'wav', Data: wav.toString('base64'), DataLen: wav.length } },
  { name: 'A: SourceType=0 + Data', p: { ProjectId: 0, SubServiceType: 2, EngSerViceType: '16k_zh', SourceType: 0, VoiceFormat: 'wav', Data: wav.toString('base64'), DataLen: wav.length } }
];

(async () => {
  const asr = new AsrClient({
    credential: { secretId: keys.secretId, secretKey: keys.secretKey },
    region: keys.region || 'ap-guangzhou'
  });
  for(const v of variants){
    try{
      const r = await asr.SentenceRecognition(v.p);
      console.log('✓ ' + v.name + ' → 成功 Result="' + String(r.Result || '') + '"');
      process.exit(0);
    }catch(e){
      console.log('✗ ' + v.name + ' → code=' + (e.code || '?') + ' msg=' + e.message.slice(0, 90));
    }
  }
})();
