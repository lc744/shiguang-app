package com.shiguang.reminder;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDateTime;
import java.time.ZoneId;

/** Shared AlarmManager implementation used by the Capacitor plugin and boot receiver. */
public final class AlarmScheduler {
    private AlarmScheduler() {}

    public static void sync(Context context, JSONObject payload) throws Exception {
        String eventId = payload.getString("id");
        cancel(context, eventId);
        JSONArray items = payload.optJSONArray("items");
        if (items == null) return;

        String name = payload.optString("name", "拾光提醒");
        String emoji = payload.optString("emoji", "");
        String voice = payload.optString("voice", "标准播报");
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String at = item.optString("at", "");
            if (at.isEmpty()) continue;
            String body = item.optString("body", "到点提醒");
            scheduleOne(context, eventId, i, emoji, name, body, voice, parseLocalMillis(at));
        }
    }

    public static void cancel(Context context, String eventId) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        for (int i = 0; i < 30; i++) {
            Intent intent = new Intent(context, AlarmReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    hashId(eventId + ":" + i),
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            alarmManager.cancel(pi);
            pi.cancel();
        }
    }

    private static void scheduleOne(Context context, String eventId, int index, String emoji,
                                    String name, String body, String voice, long triggerAtMillis) {
        if (triggerAtMillis <= System.currentTimeMillis()) return;
        AlarmReceiver.createChannel(context);
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.putExtra(AlarmRingingService.EXTRA_EVENT_ID, eventId);
        intent.putExtra("title", (emoji != null && !emoji.isEmpty() ? emoji.split(" ")[0] + " " : "") + name);
        intent.putExtra("body", body);
        intent.putExtra("emoji", emoji);
        intent.putExtra(AlarmRingingService.EXTRA_VOICE, voice);
        intent.putExtra("notificationId", hashId(eventId + ":" + index));
        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                hashId(eventId + ":" + index),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 优先使用 setAlarmClock：系统把它当作“用户闹钟”对待，
        // 优先级最高、Doze 不延迟、国产 ROM 杀后台后依然可靠触发。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (alarmManager.canScheduleExactAlarms()) {
                try {
                    PendingIntent showPi = PendingIntent.getActivity(
                            context,
                            hashId(eventId + ":show"),
                            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );
                    alarmManager.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAtMillis, showPi), pi);
                    return;
                } catch (Exception ignored) {
                    // 个别 ROM 不支持 setAlarmClock，回退到精确闹钟
                }
            }
            // 无精确闹钟权限时退化为普通（不精确）闹钟，确保仍能触发
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        }
    }

    private static long parseLocalMillis(String value) {
        String normalized = value.length() == 16 ? value + ":00" : value;
        LocalDateTime local = LocalDateTime.parse(normalized);
        return local.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    public static int hashId(String str) {
        int h = 0;
        for (int i = 0; i < str.length(); i++) h = ((h << 5) - h + str.charAt(i));
        return Math.abs(h == Integer.MIN_VALUE ? 0 : h);
    }
}
