package com.shiguang.reminder;

import android.util.Log;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "shiguang_alarm_channel";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.i("ShiguangAlarm", "AlarmReceiver fired: " + intent.getStringExtra("title"));
        createChannel(context);

        // 记录"已触发"：WebView 下次启动合并到 firedOn，避免同一事件被误判为"错过"
        String eventId = intent.getStringExtra(AlarmRingingService.EXTRA_EVENT_ID);
        if (eventId != null && !eventId.isEmpty()) {
            NativeActionStore.markFired(context, eventId, NativeActionStore.today());
        }

        Intent serviceIntent = new Intent(context, AlarmRingingService.class)
                .setAction(AlarmRingingService.ACTION_START)
                .putExtra(AlarmRingingService.EXTRA_EVENT_ID, intent.getStringExtra(AlarmRingingService.EXTRA_EVENT_ID))
                .putExtra(AlarmRingingService.EXTRA_TITLE, intent.getStringExtra("title"))
                .putExtra(AlarmRingingService.EXTRA_BODY, intent.getStringExtra("body"))
                .putExtra(AlarmRingingService.EXTRA_EMOJI, intent.getStringExtra("emoji"))
                .putExtra(AlarmRingingService.EXTRA_VOICE, intent.getStringExtra(AlarmRingingService.EXTRA_VOICE))
                .putExtra(AlarmRingingService.EXTRA_NOTIFICATION_ID, intent.getIntExtra("notificationId", (int) System.currentTimeMillis()));
        ContextCompat.startForegroundService(context, serviceIntent);
    }

    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "拾光提醒",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("拾光事件到点提醒");
            channel.enableVibration(true);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
