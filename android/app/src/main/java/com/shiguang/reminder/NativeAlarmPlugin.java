package com.shiguang.reminder;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.ArrayList;

@CapacitorPlugin(
        name = "NativeAlarm",
        permissions = {
                @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications"),
                @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone")
        }
)
public class NativeAlarmPlugin extends Plugin {

    private SpeechRecognizer speechRecognizer = null;
    private PluginCall pendingSpeechCall = null;

    /* ---- 权限入口（前端启动时调用） ---- */

    @PluginMethod
    public void getStatusBarHeight(PluginCall call) {
        JSObject out = new JSObject();
        int height = 0;
        try {
            int resourceId = getContext().getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (resourceId > 0) {
                height = getContext().getResources().getDimensionPixelSize(resourceId);
            }
        } catch (Exception ex) {
            // ignore
        }
        out.put("height", height);
        call.resolve(out);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("notifications", call, "onNotificationPermissionResult");
        } else {
            finishPermissionRequest(call);
        }
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception ex) {
            call.reject("openExactAlarmSettings failed", ex);
        }
    }

    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception ex) {
            call.reject("openFullScreenIntentSettings failed", ex);
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("openBatterySettings failed", ex);
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } else {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception ex) {
            call.reject("openNotificationSettings failed", ex);
        }
    }

    @PluginMethod
    public void openAppDetails(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("openAppDetails failed", ex);
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        finishPermissionRequest(call);
    }

    /* ---- 模块化语音包 ---- */

    @PluginMethod
    public void listVoicePacks(PluginCall call) {
        try { call.resolve(new JSObject(VoicePackManager.list(getContext()).toString())); }
        catch (Exception ex) { call.reject("listVoicePacks failed", ex); }
    }

    @PluginMethod
    public void previewVoice(PluginCall call) {
        String voice = call.getString("voice", "甜美学妹");
        String text = call.getString("text", "你好呀，这里是拾光。记得按时完成今天的安排哦。");
        new Thread(() -> {
            OfflineVoiceEngine engine = new OfflineVoiceEngine(getContext());
            try {
                engine.speak(text, voice, previewSpeaker(voice), previewSpeed(voice));
                call.resolve();
            } catch (Exception ex) { call.reject("previewVoice failed", ex); }
            finally { engine.release(); }
        }, "voice-preview").start();
    }

    private int previewSpeaker(String voice) {
        switch (voice) {
            case "甜美学妹": return 66; case "阳光少女": return 31; case "软萌少女": return 73;
            case "清新校园": return 9; case "温柔同桌": return 26; case "活泼班长": return 42;
            case "治愈少女": return 18; case "俏皮助手": return 57;
            case "甜美小贝": return 45; case "温柔小妮": return 46; case "清爽晓晓": return 47;
            case "端庄小艺": return 48; case "磁性男声": return 49; case "阳光男声": return 50;
            case "温和男声": return 51; case "厚重男声": return 52;
            default: return 0;
        }
    }
    private float previewSpeed(String voice) {
        if ("元气萌声".equals(voice)||"阳光少女".equals(voice)||"俏皮助手".equals(voice)) return 1.1f;
        if ("自然女声".equals(voice)||"温柔同桌".equals(voice)||"治愈少女".equals(voice)) return .88f;
        return 1f;
    }

    @PluginMethod
    public void deleteVoicePack(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("missing id"); return; }
        try { VoicePackManager.delete(getContext(), id); call.resolve(); }
        catch (Exception ex) { call.reject("deleteVoicePack failed", ex); }
    }

    @PluginMethod
    public void downloadVoicePack(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        String sha256 = call.getString("sha256", "");
        if (id == null || url == null) { call.reject("missing id/url"); return; }
        new Thread(() -> {
            try {
                java.io.File archive = VoicePackManager.download(getContext(), id, url, sha256);
                if ("matcha-baker-natural".equals(id)) {
                    String vocoderUrl = call.getString("vocoderUrl", "");
                    if (vocoderUrl.isEmpty()) throw new IllegalArgumentException("missing vocoderUrl");
                    java.io.File vocoder = VoicePackManager.download(getContext(), id + "-vocoder", vocoderUrl, "");
                    VoicePackManager.installMatchaPack(getContext(), id, archive, vocoder);
                    VoicePackManager.delete(getContext(), id + "-vocoder");
                } else if ("melo-zh-en".equals(id)) {
                    VoicePackManager.installGenericPack(getContext(), id, "melo", archive, "model.onnx");
                } else if ("kokoro-cn".equals(id)) {
                    VoicePackManager.installGenericPack(getContext(), id, "kokoro", archive, "model.int8.onnx");
                } else {
                    JSONObject marker = new JSONObject(); marker.put("id", id); marker.put("archive", archive.getAbsolutePath());
                    VoicePackManager.markInstalled(getContext(), id, marker);
                }
                JSObject out = new JSObject(); out.put("downloaded", true); out.put("installed", true);
                call.resolve(out);
            } catch (Exception ex) { call.reject("downloadVoicePack failed", ex); }
        }, "voice-pack-download").start();
    }

    /* ---- 闹钟同步（核心引擎） ---- */

    @PluginMethod
    public void syncEvent(PluginCall call) {
        try {
            JSONObject payload = call.getData();
            String eventId = payload.optString("id", null);
            if (eventId == null || payload.optJSONArray("items") == null) {
                call.reject("missing id/items");
                return;
            }
            AlarmScheduler.sync(getContext(), payload);
            getContext().getSharedPreferences("native_alarms", Context.MODE_PRIVATE)
                    .edit().putString(eventId, payload.toString()).apply();
            call.resolve();
        } catch (Exception ex) {
            call.reject("syncEvent failed", ex);
        }
    }

    @PluginMethod
    public void cancelEvent(PluginCall call) {
        String eventId = call.getString("id");
        if (eventId == null) {
            call.reject("missing id");
            return;
        }
        AlarmScheduler.cancel(getContext(), eventId);
        getContext().getSharedPreferences("native_alarms", Context.MODE_PRIVATE)
                .edit().remove(eventId).apply();
        call.resolve();
    }

    @PluginMethod
    public void consumeNativeActions(PluginCall call) {
        try {
            JSONObject data = NativeActionStore.consume(getContext());
            call.resolve(new JSObject(data.toString()));
        } catch (Exception ex) {
            call.reject("consumeNativeActions failed", ex);
        }
    }

    /* ---- 语音识别（拾光精灵） ---- */

    @PluginMethod
    public void startSpeechRecognition(PluginCall call) {
        if (pendingSpeechCall != null) {
            call.reject("already listening");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicrophonePermissionResult");
            return;
        }
        beginSpeechRecognition(call);
    }

    @PluginMethod
    public void stopSpeechRecognition(PluginCall call) {
        AppCompatActivity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                if (speechRecognizer != null) {
                    try { speechRecognizer.stopListening(); } catch (Exception ignored) {}
                }
            });
        }
        if (pendingSpeechCall != null) {
            JSObject out = new JSObject();
            out.put("text", "");
            pendingSpeechCall.resolve(out);
            pendingSpeechCall = null;
        }
        call.resolve();
    }

    private void beginSpeechRecognition(PluginCall call) {
        AppCompatActivity activity = getActivity();
        if (activity == null) {
            call.reject("no activity");
            return;
        }
        // SpeechRecognizer 必须在主线程创建和调用，Capacitor 插件方法默认在后台线程
        activity.runOnUiThread(() -> {
            boolean available = false;
            try {
                available = SpeechRecognizer.isRecognitionAvailable(getContext());
            } catch (Exception ex) {
                Log.w("ShiguangSpeech", "isRecognitionAvailable check failed", ex);
            }
            Log.d("ShiguangSpeech", "SpeechRecognizer available=" + available);
            if (available) {
                startListeningOnMainThread(call);
            } else {
                // 系统没有语音识别服务，尝试用 ACTION_RECOGNIZE_SPEECH 拉起系统语音对话框
                tryActivityRecognition(call);
            }
        });
    }

    private void tryActivityRecognition(PluginCall call) {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            startActivityForResult(call, intent, "onSpeechResult");
        } catch (Exception ex) {
            Log.e("ShiguangSpeech", "activity recognizer failed", ex);
            pendingSpeechCall = null;
            call.reject("本机未安装可用的语音识别服务，请用文字输入，或安装讯飞输入法后重试");
        }
    }

    @ActivityCallback
    private void onSpeechResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> matches = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
            JSObject out = new JSObject();
            out.put("text", text);
            call.resolve(out);
        } else if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject out = new JSObject();
            out.put("errorCode", -3);
            out.put("message", "已取消语音输入");
            call.resolve(out);
        } else {
            JSObject out = new JSObject();
            out.put("errorCode", -2);
            out.put("message", "语音识别未完成");
            call.resolve(out);
        }
    }

    // 必须在主线程调用
    private void startListeningOnMainThread(PluginCall call) {
        try {
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                tryActivityRecognition(call);
                return;
            }
            pendingSpeechCall = call;
            if (speechRecognizer == null) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            }
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}
                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                    JSObject out = new JSObject();
                    out.put("text", text);
                    if (pendingSpeechCall != null) {
                        pendingSpeechCall.resolve(out);
                        pendingSpeechCall = null;
                    }
                }
                @Override
                public void onError(int error) {
                    Log.e("ShiguangSpeech", "SpeechRecognizer onError code=" + error);
                    JSObject out = new JSObject();
                    out.put("errorCode", error);
                    out.put("message", speechErrorText(error));
                    if (pendingSpeechCall != null) {
                        pendingSpeechCall.resolve(out);
                        pendingSpeechCall = null;
                    }
                }
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            speechRecognizer.startListening(intent);
        } catch (Exception ex) {
            Log.e("ShiguangSpeech", "startListening failed", ex);
            pendingSpeechCall = null;
            call.reject("startSpeechRecognition failed: " + ex.getMessage(), ex);
        }
    }

    private String speechErrorText(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "语音服务网络超时";
            case SpeechRecognizer.ERROR_NETWORK: return "无法连接语音识别服务（网络不可用）";
            case SpeechRecognizer.ERROR_AUDIO: return "录音出错，麦克风可能被占用";
            case SpeechRecognizer.ERROR_SERVER: return "语音识别服务器出错";
            case SpeechRecognizer.ERROR_CLIENT: return "语音识别服务异常（本机可能未安装/被限制）";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "没有听到声音，请再试一次";
            case SpeechRecognizer.ERROR_NO_MATCH: return "没有识别到内容，请说清楚一点";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "语音识别服务忙，请稍后再试";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "麦克风权限不足";
            default: return "语音识别失败（错误码 " + error + "）";
        }
    }

    @PermissionCallback
    private void onMicrophonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginSpeechRecognition(call);
        } else {
            JSObject out = new JSObject();
            out.put("errorCode", -4);
            out.put("message", "麦克风权限被拒绝，请在系统设置中允许拾光使用麦克风");
            call.resolve(out);
        }
    }

    /* ---- 内部 ---- */

    private void finishPermissionRequest(PluginCall call) {
        JSObject out = new JSObject();
        PermissionState notif = getPermissionState("notifications");
        out.put("notifications",
                notif == PermissionState.GRANTED || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            out.put("exactAlarms", am != null && am.canScheduleExactAlarms());
        } else {
            out.put("exactAlarms", true);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager nm = getContext().getSystemService(NotificationManager.class);
            out.put("fullScreenIntent", nm != null && nm.canUseFullScreenIntent());
        } else {
            out.put("fullScreenIntent", true);
        }

        // 电池优化限制状态：国产 ROM 上被限制会影响后台闹钟可靠性
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            out.put("batteryRestricted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } catch (Exception ex) {
            out.put("batteryRestricted", false);
        }

        call.resolve(out);
    }

    @PermissionCallback
    private void onNotificationPermissionResult(PluginCall call) {
        finishPermissionRequest(call);
    }
}