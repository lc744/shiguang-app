package com.shiguang.reminder;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.util.Map;

/** Re-registers exact alarms after Android clears AlarmManager state on reboot. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                && !Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                && !Intent.ACTION_TIME_CHANGED.equals(action)) return;

        Map<String, ?> saved = context.getSharedPreferences("native_alarms", Context.MODE_PRIVATE).getAll();
        for (Map.Entry<String, ?> entry : saved.entrySet()) {
            if (!(entry.getValue() instanceof String)) continue;
            try {
                AlarmScheduler.sync(context, new JSONObject((String) entry.getValue()));
            } catch (Exception ignored) {
                // Ignore one malformed entry and restore the remaining alarms.
            }
        }
    }
}
