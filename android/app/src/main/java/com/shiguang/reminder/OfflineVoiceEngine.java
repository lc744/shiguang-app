package com.shiguang.reminder;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Log;

import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsMatchaModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Offline TTS with downloadable Melo/Matcha/Kokoro packs and bundled AISHELL-3 fallback. */
public final class OfflineVoiceEngine {
    private static final String TAG = "ShiguangOfflineTts";
    private static final String ASSET_DIR = "offline_tts/aishell3";
    private static final Set<String> MATCHA_STYLES = new HashSet<>(Arrays.asList("清甜女声","元气萌声","自然女声"));
    private static final Set<String> MELO_STYLES = new HashSet<>(Arrays.asList("温柔姐姐","知性女声","轻快少女"));
    private static final Set<String> KOKORO_STYLES = new HashSet<>(Arrays.asList("甜美小贝","温柔小妮","清爽晓晓","端庄小艺","阳光男声","磁性男声","温和男声","厚重男声"));

    private final Context context;
    private OfflineTts tts;
    private AudioTrack track;
    private volatile boolean stopped;
    private String currentPack = "aishell3-campus";

    public OfflineVoiceEngine(Context context) { this.context = context.getApplicationContext(); }

    public static String resolvePack(String style) {
        if (MATCHA_STYLES.contains(style)) return "matcha-baker-natural";
        if (MELO_STYLES.contains(style)) return "melo-zh-en";
        if (KOKORO_STYLES.contains(style)) return "kokoro-cn";
        return "aishell3-campus";
    }
    public static boolean isNaturalStyle(String style) {
        return MATCHA_STYLES.contains(style) || MELO_STYLES.contains(style) || KOKORO_STYLES.contains(style);
    }

    public synchronized void initialize(String style) throws Exception {
        String pack = resolvePack(style);
        if (!VoicePackManager.isInstalled(context, pack)) pack = "aishell3-campus";
        if (tts != null && pack.equals(currentPack)) return;
        releaseTtsOnly();
        try {
            switch (pack) {
                case "matcha-baker-natural": initializeMatcha(); break;
                case "melo-zh-en": initializeMelo(); break;
                case "kokoro-cn": initializeKokoro(); break;
                default: initializeVits(); break;
            }
            currentPack = pack;
        } catch (Exception ex) {
            Log.e(TAG, pack + " init failed; falling back to AISHELL-3", ex);
            initializeVits();
            currentPack = "aishell3-campus";
        }
    }

    private void initializeVits() throws Exception {
        File dir = new File(context.getFilesDir(), "offline_tts/aishell3");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Cannot create TTS directory");
        File model = copyAsset("vits-aishell3.int8.onnx", dir);
        File lexicon = copyAsset("lexicon.txt", dir);
        File tokens = copyAsset("tokens.txt", dir);
        OfflineTtsVitsModelConfig vits = OfflineTtsVitsModelConfig.builder()
                .setModel(model.getAbsolutePath()).setLexicon(lexicon.getAbsolutePath()).setTokens(tokens.getAbsolutePath()).build();
        OfflineTtsModelConfig models = OfflineTtsModelConfig.builder().setVits(vits).setNumThreads(2).setDebug(false).setProvider("cpu").build();
        tts = new OfflineTts(OfflineTtsConfig.builder().setModel(models).setMaxNumSentences(2).build());
        Log.i(TAG, "Bundled AISHELL-3 initialized, sampleRate=" + tts.getSampleRate());
    }

    private File packModelDir(String packId) throws Exception {
        File marker = new File(VoicePackManager.packDir(context, packId), "installed.json");
        String json;
        try (InputStream in = new FileInputStream(marker)) { byte[] b = new byte[(int) marker.length()]; int n = in.read(b); json = new String(b, 0, n, StandardCharsets.UTF_8); }
        File dir = new File(new JSONObject(json).getString("modelDir"));
        if (!dir.isDirectory()) throw new IllegalStateException("Model dir missing: " + dir);
        return dir;
    }

    private void initializeMatcha() throws Exception {
        File dir = packModelDir("matcha-baker-natural");
        OfflineTtsMatchaModelConfig matcha = OfflineTtsMatchaModelConfig.builder()
                .setAcousticModel(new File(dir,"model-steps-3.onnx").getAbsolutePath())
                .setVocoder(new File(dir,"vocos-22khz-univ.onnx").getAbsolutePath())
                .setLexicon(new File(dir,"lexicon.txt").getAbsolutePath())
                .setTokens(new File(dir,"tokens.txt").getAbsolutePath())
                .setDictDir(new File(dir,"dict").getAbsolutePath()).build();
        OfflineTtsModelConfig models = OfflineTtsModelConfig.builder().setMatcha(matcha).setNumThreads(2).setDebug(false).setProvider("cpu").build();
        String rules = new File(dir,"phone.fst").getAbsolutePath()+","+new File(dir,"date.fst").getAbsolutePath()+","+new File(dir,"number.fst").getAbsolutePath();
        tts = new OfflineTts(OfflineTtsConfig.builder().setModel(models).setRuleFsts(rules).setMaxNumSentences(2).build());
        Log.i(TAG, "Matcha Baker initialized, sampleRate=" + tts.getSampleRate());
    }

    private void initializeMelo() throws Exception {
        File dir = packModelDir("melo-zh-en");
        OfflineTtsVitsModelConfig vits = OfflineTtsVitsModelConfig.builder()
                .setModel(new File(dir,"model.onnx").getAbsolutePath())
                .setLexicon(new File(dir,"lexicon.txt").getAbsolutePath())
                .setTokens(new File(dir,"tokens.txt").getAbsolutePath())
                .build();
        OfflineTtsModelConfig models = OfflineTtsModelConfig.builder().setVits(vits).setNumThreads(2).setDebug(false).setProvider("cpu").build();
        String rules = new File(dir,"phone.fst").getAbsolutePath()+","+new File(dir,"date.fst").getAbsolutePath()+","+new File(dir,"number.fst").getAbsolutePath();
        tts = new OfflineTts(OfflineTtsConfig.builder().setModel(models).setRuleFsts(rules).setMaxNumSentences(2).build());
        Log.i(TAG, "MeloTTS initialized, sampleRate=" + tts.getSampleRate());
    }

    private void initializeKokoro() throws Exception {
        File dir = packModelDir("kokoro-cn");
        String lexicons = new File(dir,"lexicon-us-en.txt").getAbsolutePath() + "," + new File(dir,"lexicon-zh.txt").getAbsolutePath();
        OfflineTtsKokoroModelConfig kokoro = OfflineTtsKokoroModelConfig.builder()
                .setModel(new File(dir,"model.int8.onnx").getAbsolutePath())
                .setVoices(new File(dir,"voices.bin").getAbsolutePath())
                .setTokens(new File(dir,"tokens.txt").getAbsolutePath())
                .setLexicon(lexicons)
                .setDataDir(new File(dir,"espeak-ng-data").getAbsolutePath())
                .setLengthScale(1.0f).build();
        OfflineTtsModelConfig models = OfflineTtsModelConfig.builder().setKokoro(kokoro).setNumThreads(2).setDebug(false).setProvider("cpu").build();
        String rules = new File(dir,"phone-zh.fst").getAbsolutePath()+","+new File(dir,"date-zh.fst").getAbsolutePath()+","+new File(dir,"number-zh.fst").getAbsolutePath();
        tts = new OfflineTts(OfflineTtsConfig.builder().setModel(models).setRuleFsts(rules).setMaxNumSentences(1).build());
        Log.i(TAG, "Kokoro initialized, sampleRate=" + tts.getSampleRate());
    }

    public void speak(String text, String style, int speakerId, float speed) throws Exception {
        initialize(style);
        stopped = false;
        int sid = speakerId;
        if (currentPack.equals("matcha-baker-natural")) sid = 0;
        if (currentPack.equals("melo-zh-en")) sid = 0;
        String synthesisText = !"aishell3-campus".equals(currentPack) && text.length() > 55 ? text.substring(0, 55) + "。" : text;
        GeneratedAudio audio = tts.generate(synthesisText, Math.max(0, sid), speed);
        if (stopped || audio == null || audio.getSamples().length == 0) return;
        play(audio.getSamples(), audio.getSampleRate());
    }

    public void speak(String text, int speakerId, float speed) throws Exception { speak(text, "标准播报", speakerId, speed); }

    private void play(float[] samples, int sampleRate) {
        int minBuffer = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
        AudioAttributes attrs = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        AudioFormat format = new AudioFormat.Builder().setSampleRate(sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build();
        track = new AudioTrack(attrs, format, Math.max(minBuffer, 8192), AudioTrack.MODE_STREAM, AudioManager.AUDIO_SESSION_ID_GENERATE);
        track.play(); int offset=0;
        while (!stopped && offset<samples.length) { int n=track.write(samples,offset,Math.min(8192,samples.length-offset),AudioTrack.WRITE_BLOCKING); if(n<=0)break; offset+=n; }
        try { track.stop(); track.release(); } catch(Exception ignored) {} track=null;
    }

    public synchronized void stop() { stopped=true; try { if(track!=null){track.pause();track.flush();track.stop();track.release();} }catch(Exception ignored){} track=null; }
    private void releaseTtsOnly(){ if(tts!=null){try{tts.release();}catch(Exception ignored){} tts=null;} }
    public synchronized void release(){ stop(); releaseTtsOnly(); }

    private File copyAsset(String name, File dir) throws Exception {
        File out=new File(dir,name); AssetManager assets=context.getAssets(); long expected;
        try(InputStream input=assets.open(ASSET_DIR+"/"+name)){expected=input.available();}
        if(out.exists()&&out.length()==expected)return out;
        File temp=new File(dir,name+".tmp");
        try(InputStream input=assets.open(ASSET_DIR+"/"+name);FileOutputStream output=new FileOutputStream(temp)){byte[] buffer=new byte[1024*1024];int n;while((n=input.read(buffer))>0)output.write(buffer,0,n);output.getFD().sync();}
        if(out.exists()&&!out.delete())throw new IllegalStateException("Cannot replace "+out);
        if(!temp.renameTo(out))throw new IllegalStateException("Cannot install "+out); return out;
    }
}
