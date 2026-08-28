package com.shiguang.reminder;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;


public class AlarmRingingService extends Service {
    public static final String ACTION_START = "com.shiguang.reminder.ACTION_START_ALARM";
    public static final String ACTION_STOP = "com.shiguang.reminder.ACTION_STOP_ALARM";
    public static final String ACTION_SNOOZE = "com.shiguang.reminder.ACTION_SNOOZE_ALARM";
    public static final String EXTRA_EVENT_ID = "eventId";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_EMOJI = "emoji";
    public static final String EXTRA_VOICE = "voice";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";

    private static final int FOREGROUND_ID = 424242;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Ringtone ringtone;
    private Vibrator vibrator;
    private OfflineVoiceEngine offlineVoice;
    private Thread speechThread;
    private String pendingSpeechText;
    private String voiceStyle = "标准播报";
    private final Runnable timeoutStop = this::stopNow;
    private final Runnable repeatSpeech = new Runnable() {
        @Override public void run() {
            speakNow();
            handler.postDelayed(this, 18_000);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopNow();
            return START_NOT_STICKY;
        }
        if (ACTION_SNOOZE.equals(action)) {
            AlarmActionReceiver.scheduleSnooze(this, intent);
            stopNow();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String emoji = intent.getStringExtra(EXTRA_EMOJI);
        String eventId = intent.getStringExtra(EXTRA_EVENT_ID);
        voiceStyle = safe(intent.getStringExtra(EXTRA_VOICE), "标准播报");
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, FOREGROUND_ID);
        pendingSpeechText = buildSpeechText(title, body, voiceStyle);

        startForeground(FOREGROUND_ID, buildForegroundNotification(eventId, title, body, emoji, voiceStyle, notificationId));
        // 双保险：部分 ROM / 未授权全屏弹窗权限时 full-screen intent 会被系统拦截，
        // 这里在前台服务刚启动的豁免窗口内直接拉起提醒界面。
        launchAlertActivity(eventId, title, body, emoji, voiceStyle, notificationId);
        startSoundAndVibration(!"仅铃声".equals(voiceStyle));
        startTextToSpeech();

        handler.removeCallbacks(timeoutStop);
        handler.postDelayed(timeoutStop, 60_000);
        return START_STICKY;
    }

    private void launchAlertActivity(String eventId, String title, String body, String emoji, String voice, int notificationId) {
        try {
            Intent alertIntent = copyExtras(new Intent(this, AlarmAlertActivity.class), eventId, title, body, emoji, voice, notificationId)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(alertIntent);
        } catch (Exception ex) {
            android.util.Log.w("ShiguangAlarm", "Direct alert activity launch blocked: " + ex.getMessage());
        }
    }

    private Notification buildForegroundNotification(String eventId, String title, String body, String emoji, String voice, int id) {
        Intent doneIntent = copyExtras(new Intent(this, AlarmActionReceiver.class).setAction(ACTION_STOP), eventId, title, body, emoji, voice, id);
        Intent snoozeIntent = copyExtras(new Intent(this, AlarmActionReceiver.class).setAction(ACTION_SNOOZE), eventId, title, body, emoji, voice, id);
        PendingIntent donePi = PendingIntent.getBroadcast(this, id + 1000, doneIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent snoozePi = PendingIntent.getBroadcast(this, id + 2000, snoozeIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent fullScreenIntent = copyExtras(new Intent(this, AlarmAlertActivity.class), eventId, title, body, emoji, voice, id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fullScreenPi = PendingIntent.getActivity(this, id + 3000, fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, AlarmReceiver.CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(safe(title, "拾光提醒"))
                .setContentText(safe(body, "到点提醒"))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(safe(body, "到点提醒")))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(fullScreenPi, true)
                .setContentIntent(fullScreenPi)
                .addAction(0, "稍后 10 分钟", snoozePi)
                .addAction(0, "完成", donePi)
                .build();
    }

    private Intent copyExtras(Intent intent, String eventId, String title, String body, String emoji, String voice, int id) {
        return intent.putExtra(EXTRA_EVENT_ID, eventId).putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_BODY, body).putExtra(EXTRA_EMOJI, emoji)
                .putExtra(EXTRA_VOICE, voice).putExtra(EXTRA_NOTIFICATION_ID, id);
    }

    private String buildSpeechText(String title, String body, String style) {
        String prefix;
        switch (style) {
            case "温柔女声": prefix = "温馨提醒。"; break;
            case "清晰女声": prefix = "拾光提醒你。"; break;
            case "活力女声": prefix = "嗨，该行动啦。"; break;
            case "沉稳男声": prefix = "请注意，你有一项安排。"; break;
            case "活力男声": prefix = "加油，现在开始完成它。"; break;
            case "电台主播": prefix = "这里是拾光，现在为你播报提醒。"; break;
            case "童声音色": prefix = "叮咚，别忘记这件事。"; break;
            case "舒缓播报": prefix = "慢下来，记得处理这项安排。"; break;
            default: prefix = "拾光提醒。";
        }
        String cleanTitle = safe(title, "提醒").replaceFirst("^[^\\p{L}\\p{N}]+\\s*", "");
        String cleanBody = safe(body, "");
        return prefix + cleanTitle + (cleanBody.isEmpty() ? "。" : "。备注是，" + cleanBody + "。");
    }

    private void startTextToSpeech() {
        handler.removeCallbacks(repeatSpeech);
        if ("仅铃声".equals(voiceStyle) || "自定义录音".equals(voiceStyle)) return;
        if (offlineVoice == null) offlineVoice = new OfflineVoiceEngine(getApplicationContext());
        handler.postDelayed(repeatSpeech, 800);
    }

    private int speakerForStyle(String style) {
        switch (style) {
            case "甜美学妹": return 66;
            case "阳光少女": return 31;
            case "软萌少女": return 73;
            case "清新校园": return 9;
            case "温柔同桌": return 26;
            case "活泼班长": return 42;
            case "治愈少女": return 18;
            case "俏皮助手": return 57;
            case "沉稳男声": return 10;
            case "活力男声": return 52;
            case "甜美小贝": return 45;
            case "温柔小妮": return 46;
            case "清爽晓晓": return 47;
            case "端庄小艺": return 48;
            case "磁性男声": return 49;
            case "阳光男声": return 50;
            case "温和男声": return 51;
            case "厚重男声": return 52;
            default: return 0;
        }
    }

    private float speedForStyle(String style) {
        switch (style) {
            case "甜美学妹": return 0.90f;
            case "阳光少女": return 1.08f;
            case "软萌少女": return 1.02f;
            case "温柔同桌": return 0.86f;
            case "活泼班长": return 1.10f;
            case "治愈少女": return 0.84f;
            case "俏皮助手": return 1.12f;
            case "沉稳男声": return 0.88f;
            case "活力男声": return 1.10f;
            case "知性女声": return 0.90f;
            case "轻快少女": return 1.12f;
            case "清爽晓晓": return 1.05f;
            case "端庄小艺": return 0.95f;
            case "磁性男声": return 0.95f;
            case "阳光男声": return 1.05f;
            case "温和男声": return 0.95f;
            case "厚重男声": return 0.92f;
            default: return 1.0f;
        }
    }

    private void speakNow() {
        if (offlineVoice == null || pendingSpeechText == null || speechThread != null && speechThread.isAlive()) return;
        speechThread = new Thread(() -> {
            try {
                offlineVoice.speak(pendingSpeechText, voiceStyle, speakerForStyle(voiceStyle), speedForStyle(voiceStyle));
                android.util.Log.i("ShiguangOfflineTts", "Offline speech completed: " + voiceStyle);
            } catch (Throwable ex) {
                android.util.Log.e("ShiguangOfflineTts", "Offline speech failed", ex);
            }
        }, "shiguang-offline-tts");
        speechThread.start();
    }

    private void startSoundAndVibration(boolean lowerRingtoneForSpeech) {
        stopSoundAndVibration();
        try {
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            ringtone = RingtoneManager.getRingtone(this, sound);
            if (ringtone != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
            if (ringtone != null) ringtone.play();
        } catch (Exception ignored) {}
        try {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = new long[]{0, 900, 400, 900};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                else vibrator.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {}
    }

    private void stopSoundAndVibration() {
        try { if (ringtone != null && ringtone.isPlaying()) ringtone.stop(); } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
    }

    private void stopNow() {
        handler.removeCallbacks(timeoutStop);
        handler.removeCallbacks(repeatSpeech);
        stopSoundAndVibration();
        shutdownTts();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void shutdownTts() {
        try { if (offlineVoice != null) offlineVoice.release(); } catch (Exception ignored) {}
        offlineVoice = null;
        speechThread = null;
    }

    private String safe(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(timeoutStop);
        handler.removeCallbacks(repeatSpeech);
        stopSoundAndVibration();
        shutdownTts();
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
