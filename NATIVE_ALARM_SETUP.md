# 原生闹钟提醒

拾光的 Android 版本使用 `AlarmManager + BroadcastReceiver + NotificationChannel`，不依赖 WebView 定时器。

## 行为

- 保存/编辑事件时，前端通过 `NativeAlarm` 插件向系统注册未来 30 次提醒。
- 到点由 `AlarmReceiver` 被系统唤醒并发布高优先级通知。
- App 进程被系统回收或从最近任务划掉后，已注册的闹钟仍可触发。
- 手机重启、时区变化或 App 更新后，由 `BootReceiver` 从 SharedPreferences 恢复已保存闹钟。

## 必要权限

- Android 13+：允许“通知”。
- Android 12+：允许“闹钟和提醒”中的精确闹钟。
- Android 14+：允许“全屏通知”。
- 建议允许电池优化豁免（App 内「设置 → 原生提醒权限 → 电池优化豁免」会引导到系统页）。
- 小米、OPPO、vivo、华为等系统：建议打开自启动，并将电池策略设置为“不限制”。

## 权限引导

App 内的「设置 → 原生提醒权限」卡片会实时检测以下状态并提供“去开启”入口：

- 通知权限（`NativeAlarm.getStatus().notifications`）
- 精确闹钟（`getStatus().exactAlarms`，Android 12+）
- 全屏通知（`getStatus().fullScreenIntent`，Android 14+）
- 电池优化豁免（`getStatus().batteryRestricted`，受限时引导豁免）

## 重要限制

系统设置里的“强行停止/强制停止”会按 Android 设计取消该应用的闹钟和广播；普通的进程回收、锁屏、从最近任务划掉不等同于强行停止。

## 测试

`拾光-原生闹钟-最终.apk` 已在 Android 34 模拟器中验证：

1. 注册 60 秒后的 `AlarmManager` 精确闹钟。
2. 使用 `adb shell am kill` 杀掉 App 进程。
3. 到点 `AlarmReceiver` 成功发布包含标题和备注的系统通知。
