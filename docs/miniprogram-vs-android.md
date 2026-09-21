# 小程序 vs 安卓 App：提醒/播报功能对照记录

> 结论先行：提醒相关能力小程序**只保留两条平台替代线**——
> ① **微信订阅消息推送**（替代安卓原生闹钟铃声）
> ② **云函数 TTS 语音播报**（替代安卓离线 TTS 语音包）
> 两者均已实现并接通，配置要求见文末「部署与配置清单」。其余与安卓不一致的自创实现已核查，无重复代码需要删除。

## 一、逐项对照

| 安卓 App 的方案 | 小程序的方案 | 状态 | 平台限制（做不好/做不到的） |
|---|---|---|---|
| 原生闹钟（AlarmManager 精确唤醒，锁屏也能响） | **微信一次性订阅消息**：云函数 `pushDue` 每分钟定时扫描 → `subscribeMessage.send` 推送 | ✅ 已实现 | ① 每次提醒都要用户提前点一次授权（一次性订阅，一次授权一次推送）② 到点只弹微信服务通知，**不能锁屏自动全屏响铃** ③ 用户不点通知就不进提醒页 |
| 自定义闹钟铃声 | 订阅消息使用微信内置通知音 | ⚠️ 平台限制 | 小程序无法自定义推送提示音，随微信系统通知音 |
| 语音播报（离线 TTS，voice pack 已下载即可用） | **云函数 TTS**：`utils/tts.js → callFunction('tts') → 腾讯云 TextToVoice → mp3 缓存 → InnerAudioContext 播放` | ✅ 已实现 | ① 必须联网（离线不可用）② 每次合成有 1-2 秒延迟（已做用户目录缓存，同文案只合成一次）③ 腾讯云 TTS 有调用量计费 |
| 后台常驻 / 自启动 | 无。打开小程序时 `app.js onLaunch → notify.findDue()` 前台检查到点事件并弹全屏提醒页 | ✅ 一比一等价 | 小程序无后台进程，关闭后无法主动弹提醒 |
| 错过提醒（AlarmActivity 补弹） | **错过横幅**：首页 `notify.scanMissed()` 扫描今天已到点未触发的事件，missedBanner 展示 | ✅ 一比一等价 | — |
| 贪睡（Snooze +N 分钟） | `notify.snoozeEvent(e, 10)`，到点重新触发 | ✅ 一比一等价 | — |
| 完成标记 | `notify.completeToday(e)`，按日记录 doneOn | ✅ 一比一等价 | — |
| 重复/周期提醒（每天/每周/生日农历） | `core.occursOn` 判断（weekdays/date/lunarBirthday/isBirthday） | ✅ 一比一等价 | 订阅消息仅覆盖**一次性日期事件**；周期事件到点也会推送（pushDue 按日扫描），但一次性授权额度用完后需再授权 |
| 录音自定义播报 | remind 页优先播自定义录音，其次云 TTS | ✅ 一比一等价 | — |

## 二、小程序提醒链路全景（现有实现，勿重复建设）

```
用户保存/修改事件 (editor.js)
  └─ subscribe.askAndSync(ev)          ← 请求订阅授权 + callFunction('syncEvent') 云同步
       ├─ 云端 reminders 集合（推送数据源）
       └─ pushDue 定时触发器（每分钟）   ← config.json triggers "0 * * * * * *"
            └─ 到点 → subscribeMessage.send（订阅消息推给用户）
                 └─ 用户点通知 → remind 全屏提醒页
                      ├─ notify.markFired / snoozeEvent / completeToday
                      └─ tts 播报（自定义录音优先，否则云 TTS）

用户直接打开小程序（前台）
  └─ app.js onLaunch → notify.findDue() → 到点弹 remind（本地路径，不依赖推送）
  └─ 首页 missedBanner → notify.scanMissed()（错过横幅）
```

## 三、部署与配置清单（推送链路要能跑通，以下缺一不可）

1. **模板 ID**（两处必须同一个 ID）：
   - `miniprogram/utils/config.js → SUBSCRIBE_TEMPLATE_ID` ✅ 已填
   - `miniprogram/cloudfunctions/pushDue/secret.json → templateId`（gitignore，部署时带上）
2. **云函数全部部署**（微信开发者工具右键 → 上传并部署：云端安装依赖）：
   `asr`、`postApi`、`profileApi`、`pushDue`、`syncEvent`、`tts`
3. **pushDue 触发器**：`config.json` 已声明每分钟定时器（`0 * * * * * *`），部署时勾选"安装依赖并上传触发器"
4. **pushDue 权限**：`config.json → permissions.openapi → subscribeMessage.send` ✅ 已声明
5. **订阅授权时机**：用户必须在**保存提醒的手势里**授权（`wx.requestSubscribeMessage` 必须用户点击触发），拒绝后事件照常保存但该次到点不会推送

## 四、明确做不到的（平台硬限制，勿再尝试）

- ❌ 锁屏自动全屏响铃（安卓 AlarmActivity 的等价物不存在）
- ❌ 自定义推送提示音
- ❌ 无后台常驻、无自启动、无系统级闹钟注册
- ❌ 离线 TTS（个人主体小程序无法用同声传译插件，已用云 TTS 替代）
- ❌ 无限次推送（一次性订阅消息一次授权只推一条；"长期订阅"仅政务/医疗等特定类目开放）
