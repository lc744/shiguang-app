package com.shiguang.reminder;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.SpeechRecognizer;

import androidx.activity.result.ActivityResult;

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

@CapacitorPlugin(
        name = "NativeAlarm",
        permissions = {
                @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications"),
                @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone")
        }
)
public class NativeAlarmPlugin extends Plugin {

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
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicrophonePermissionResult");
            return;
        }
        // 启动自定义弹窗 Activity（正弦波 + 录制按钮）
        Intent intent = new Intent(getContext(), SpeechDialogActivity.class);
        startActivityForResult(call, intent, "onSpeechDialogResult");
    }

    @PluginMethod
    public void stopSpeechRecognition(PluginCall call) {
        call.resolve();
    }

    @ActivityCallback
    private void onSpeechDialogResult(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        if (data == null) {
            JSObject out = new JSObject();
            out.put("errorCode", -2);
            out.put("message", "语音识别未完成");
            call.resolve(out);
            return;
        }
        String text = data.getStringExtra("text");
        int errorCode = data.getIntExtra("errorCode", 0);
        if (text != null && !text.isEmpty()) {
            JSObject out = new JSObject();
            out.put("text", text);
            call.resolve(out);
        } else if (errorCode == SpeechDialogActivity.ERR_CANCELED) {
            JSObject out = new JSObject();
            out.put("errorCode", errorCode);
            out.put("message", "已取消语音输入");
            call.resolve(out);
        } else {
            JSObject out = new JSObject();
            out.put("errorCode", errorCode);
            out.put("message", speechErrorText(errorCode));
            call.resolve(out);
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
            case SpeechDialogActivity.ERR_CANCELED: return "已取消语音输入";
            case SpeechDialogActivity.ERR_NO_RESULT: return "没有识别到你说的话";
            case SpeechDialogActivity.ERR_UNAVAILABLE: return "本机未安装可用的语音识别服务，请用文字输入，或安装讯飞输入法后重试";
            default: return "语音识别失败，请用文字输入";
        }
    }

    @PermissionCallback
    private void onMicrophonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            Intent intent = new Intent(getContext(), SpeechDialogActivity.class);
            startActivityForResult(call, intent, "onSpeechDialogResult");
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