package com.shiguang.reminder;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

public class AlarmActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (AlarmRingingService.ACTION_SNOOZE.equals(action)) {
            scheduleSnooze(context, intent);
        } else if (AlarmRingingService.ACTION_STOP.equals(action)) {
            // 用户点了“完成”：记录下来，WebView 启动/回前台时合并进事件数据
            String eventId = intent.getStringExtra(AlarmRingingService.EXTRA_EVENT_ID);
            NativeActionStore.markDone(context, eventId, NativeActionStore.today());
        }
        Intent stopIntent = new Intent(context, AlarmRingingService.class).setAction(AlarmRingingService.ACTION_STOP);
        ContextCompat.startForegroundService(context, stopIntent);
        context.sendBroadcast(new Intent(Intent.ACTION_CLOSE_SYSTEM_DIALOGS));
    }

    public static void scheduleSnooze(Context context, Intent source) {
        long triggerAt = System.currentTimeMillis() + 10 * 60 * 1000L;
        String eventId = source.getStringExtra(AlarmRingingService.EXTRA_EVENT_ID);
        String title = source.getStringExtra(AlarmRingingService.EXTRA_TITLE);
        String body = source.getStringExtra(AlarmRingingService.EXTRA_BODY);
        String emoji = source.getStringExtra(AlarmRingingService.EXTRA_EMOJI);
        String voice = source.getStringExtra(AlarmRingingService.EXTRA_VOICE);
        int notificationId = source.getIntExtra(AlarmRingingService.EXTRA_NOTIFICATION_ID, 999999);

        Intent ringIntent = new Intent(context, AlarmReceiver.class);
        ringIntent.putExtra(AlarmRingingService.EXTRA_EVENT_ID, eventId);
        ringIntent.putExtra("title", title);
        ringIntent.putExtra("body", body);
        ringIntent.putExtra("emoji", emoji);
        ringIntent.putExtra(AlarmRingingService.EXTRA_VOICE, voice);
        ringIntent.putExtra("notificationId", notificationId + 5000);

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                AlarmScheduler.hashId((eventId != null ? eventId : "snooze") + ":snooze"),
                ringIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }
}
