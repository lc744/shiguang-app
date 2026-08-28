package com.shiguang.reminder;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * 记录原生侧发生的用户动作（完成 / 已触发）。
 * WebView 下次启动（或回到前台）时通过 consumeActions() 取走并合并进事件数据，
 * 保证“通知栏/全屏弹窗上点的完成”与 App 内状态一致。
 */
public final class NativeActionStore {
    private static final String PREFS = "native_actions";
    private static final String KEY = "actions";

    private NativeActionStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 与前端 todayStr() 完全一致的 yyyy-MM-dd（零填充） */
    public static String today() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    private static JSONObject load(Context context) {
        try { return new JSONObject(prefs(context).getString(KEY, "{}")); }
        catch (Exception ex) { return new JSONObject(); }
    }

    private static void save(Context context, JSONObject data) {
        prefs(context).edit().putString(KEY, data.toString()).apply();
    }

    /** kind: "done" | "fired"；同一天重复记录自动去重 */
    private static void mark(Context context, String kind, String eventId, String date) {
        if (eventId == null || eventId.isEmpty() || date == null || date.isEmpty()) return;
        try {
            JSONObject data = load(context);
            JSONObject section = data.optJSONObject(kind);
            if (section == null) { section = new JSONObject(); data.put(kind, section); }
            String existing = section.optString(eventId, "");
            if (existing.isEmpty()) section.put(eventId, date);
            else if (!existing.contains(date)) section.put(eventId, existing + "," + date);
            save(context, data);
        } catch (Exception ignored) {}
    }

    /** 用户在原生弹窗/通知上点了“完成” */
    public static void markDone(Context context, String eventId, String date) { mark(context, "done", eventId, date); }

    /** 原生闹钟已触发（响过铃） */
    public static void markFired(Context context, String eventId, String date) { mark(context, "fired", eventId, date); }

    /** 取出全部记录并清空存储：{"done":{eventId:"yyyy-MM-dd,yyyy-MM-dd"},"fired":{...}} */
    public static JSONObject consume(Context context) {
        JSONObject data = load(context);
        prefs(context).edit().remove(KEY).apply();
        return data;
    }
}
