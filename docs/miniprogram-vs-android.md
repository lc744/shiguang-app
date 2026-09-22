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

## 事件云同步 + 提醒方式开关（方案C'，2026-09 实现）

### 事件云同步（小程序端已上线，安卓端待接入）
- 集合：`eventSync`（全量镜像，`_id`=事件id，`owner`=openid，按 `updatedAt` 幂等取舍）
- 接口：`syncEvent` 云函数新增 `pushAll` / `pullAll` / `delOne` 动作（原 `upsert/delete/get/deleteAll` 为推送源 reminders 集合保留）
- 客户端：`utils/sync.js` —— `syncNow()`（push全部→pull合并）/ `markDirty()`（3秒防抖，store.setEvents/updateEvent 自动触发）/ `delEvent(id)`（删除时同步删云端镜像）
- 合并规则：先 push 本地全部 → pull → 云端有本地无=他端新增（voiceData 置空）→ 都有=updatedAt 大者赢（保留本地 voiceData）
- 触发点：app.js onShow、编辑器保存、detail 删除/完成、首页/预告多选删除、清空、备份导入、生日自动事件增删
- 语音录音 dataUrl 不上云（本地资源跨端不可用），响铃由各端本地/订阅消息负责

### 提醒方式开关（remindVia）
- 取值：`subscribe`（微信服务通知，默认）/ `both`（两端）/ `app`（仅App闹钟）；存量数据缺省视为 subscribe
- 编辑器：绑定 App 后（identity.boundApp，绑定码成功后写入）显示三选 chips；未绑定固定"微信服务通知"说明行
- 推送判定：`pushDue` 扫描时 `remindVia === 'app'` 的事件直接 markFired 跳过发送；`subscribe/both` 正常发送
- 安卓端：接入同步后，`remindVia === 'subscribe'` 的事件可跳过 AlarmManager（待安卓接入时实现）

### 待办
- ~~安卓端接入~~（已完成 2026-09）：function/profileApi（TCB HTTP）新增 eventPush/eventPull/eventDelOne（PG events 表，uid 归属，updatedAt 幂等）；app/cloud.js 新增 window.EventSync（markDirty 防抖 push / syncNow push+pull 合并 / delOne），core.js persist 挂钩 + __eventsReplace 合并写入，启动后 4s/12s 两次自动拉取；删除路径（详情/多选/清空/精灵语音/生日自动删）全部挂 delOne；编辑器新增"提醒方式"三选（登录解锁，缺省 App本地提醒）；syncNativeNotifs 跳过 remindVia='subscribe' 的事件（只发微信通知）
- **跨端合并桥（已完成 2026-09）**：syncEvent 云函数内置 TC3 直签（环境变量 TCB_SECRET_ID/TCB_SECRET_KEY，缺省自动降级仅文档库）访问 TCB PG——pushAll 时小程序事件镜像写入 PG（uid=wxUid(openid) 确定性推导，与安卓微信登录账号 uid 一致，无需绑定表）；pullAll 时并入 PG 事件（同 id updatedAt 赢）；delOne 双删。安卓只读写 PG，小程序读写两侧 = 双向互通。限制：邮箱登录的安卓账号（uid=认证网关sub）暂不在桥内，仅微信登录账号（uid=wxUid(openid)）桥接
- **存储架构说明**：安卓 profileApi 走 TCB PostgreSQL（ExecutePGSql），小程序云函数走微信云开发文档数据库——**两套独立存储**。事件同步同理：安卓事件镜像在 PG events 表，小程序事件镜像在 eventSync 集合。跨端合并（绑定组归并/双库桥）为下一步工作，需在 syncEvent 云函数内置 TCB 直签密钥（环境变量 TCB_SECRET_ID/KEY，可复用 profileApi 的 crypto 直签代码）访问 PG
- 绑定组归属：绑定后两端事件合并到同一身份（当前安卓按 uid、小程序按 openid 各自归属，跨端合并需做 owner 归并）