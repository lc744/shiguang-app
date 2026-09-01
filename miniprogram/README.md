# 绸缪 · 微信小程序版

Web/App 版「绸缪」的微信小程序移植版。一套代码跑在微信里，iOS/Android 通用，无需 App Store / 应用商店审核。

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss / theme.json   全局入口、配置、样式（深浅色自适应）
├── project.config.json                          开发者工具项目配置（appid 占位 touristappid）
├── utils/
│   ├── core.js        纯逻辑：常量、日期、重复规则（与 App 版 core.js 同源）
│   ├── lunar.js       农历算法（与 App 版同源，生日农历提醒用）
│   ├── store.js       存储层：wx storage + 用户目录文件（表情图片/录音）
│   ├── notify.js      到点判断、错过扫描、贪睡、完成
│   ├── tts.js         语音播报（微信同声传译插件 TTS）+ 录音播放
│   ├── genie-core.js  精灵意图解析（纯逻辑）
│   ├── hero.js        首页寄语幻灯片数据
│   └── format.js      日期/时段/剩余天数格式化
├── pages/  home(今天) upcoming(预告) calendar(日历) settings(设置) editor(编辑) detail(详情) remind(到点提醒)
└── components/genie/  绸缪精灵聊天面板
```

## 打开与调试

1. 下载安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」→ 选择本目录 `miniprogram/` → AppID 先用测试号（默认 `touristappid` 可体验）
3. 模拟器即可预览；点「预览」扫码真机体验

### 启用语音播报 / 精灵语音输入（云开发版，个人主体可用）

> 「微信同声传译」插件**不支持个人主体小程序**，已弃用插件路线，改为 **微信云开发云函数 + 腾讯云语音接口**（个人实名腾讯云账号即可，均有免费额度）。未开通时语音功能自动降级（播报静默、语音按钮提示用文字），其余功能不受影响。

架构：
- `cloudfunctions/tts`：文字 → 腾讯云语音合成（TextToVoice）→ mp3 base64 → 前端写本地缓存播放
- `cloudfunctions/asr`：录音 mp3 base64 → 腾讯云一句话识别（SentenceRecognition）→ 文字 → 精灵处理

开通步骤（约 15 分钟，一次性）：
1. **开通云开发**：微信开发者工具左上角「云开发」→ 开通（按量付费，个人用量基本落在免费额度内），创建环境后若环境 ID 不是默认环境，在 `app.js` 的 `wx.cloud.init({ env: '<环境ID>' })` 指定
2. **腾讯云账号**：注册[腾讯云](https://cloud.tencent.com)并完成个人实名认证 → 控制台开通「语音合成」和「语音识别」→ [API 密钥管理](https://console.cloud.tencent.com/cam/capi)新建密钥
3. **配置密钥**（二选一）：
   - 推荐：开发者工具左侧云开发图标 → 云函数列表 → 选中 `tts` / `asr` → 配置 → 环境变量，添加 `TENCENT_SECRET_ID` 和 `TENCENT_SECRET_KEY`
   - 或本地：复制 `cloudfunctions/tts/config.template.json` 为同目录 `config.json` 填入密钥（`asr` 同理；`config.json` 已被 gitignore，不会提交）
4. **部署云函数**：开发者工具资源管理器里右键 `cloudfunctions/tts` → 「上传并部署：云端安装依赖」；`cloudfunctions/asr` 同样操作
5. 编译小程序，到点提醒页即有真人语音播报，精灵🎤按钮可用语音添加提醒

音色可调：环境变量 `TTS_VOICE_TYPE`（0=智瑜·亲和女声，其他音色见腾讯云[音色列表](https://cloud.tencent.com/document/product/1073/92668)）。

## 发布流程

1. 管理后台完善小程序信息（名称「绸缪」、头像、简介）
2. **服务类目**：建议 `工具 > 效率`（个人主体可选）
3. **ICP 备案**：2023 年起新小程序需完成备案（后台引导流程，个人可办）
4. 开发者工具点「上传」→ 后台「版本管理」→ 提交审核 → 审核通过后发布

## 与 App 版的功能差异（v1）

| 功能 | App 版 | 小程序版 |
|---|---|---|
| 事件管理/重复规则/生日(公历+农历) | ✅ | ✅ 同源逻辑 |
| 日历/错过提醒/贪睡/自动备份 | ✅ | ✅ |
| 自定义表情图片/自定义录音 | ✅ | ✅（存小程序用户目录） |
| 到点提醒 | 原生闹钟，杀后台也能弹 | **仅前台**：小程序在前台时到点弹全屏提醒；切后台/杀掉后 v1 无法提醒 |
| 语音播报 | Android 离线 TTS + 系统引擎 | 微信同声传译插件（需联网），音色统一，播报短语区分音色 |
| 语音包下载 | ✅ | ❌（小程序无离线语音引擎） |
| 导入导出 | JSON 文件 | 剪贴板方案（与 App 版备份 JSON 兼容） |

## 后台提醒路线图（v2）

小程序没有系统级闹钟。要做后台提醒需要：

1. 开通**微信云开发**（约 19.9 元/月起）
2. 事件数据同步到云数据库
3. 云函数**定时触发器**扫描即将到期的事件
4. 调用**订阅消息** API 推送服务通知（需用户在小程序内点击授权订阅，一次性订阅每授权一次可推一条）
