# 拾光移动端应用

这是一个可直接运行的手机端网页应用原型，支持：

- 记事与事件管理（今天 / 预告 / 日历 / 详情）
- 到点提醒 + 全屏提醒页（完成 / 多档贪睡 5·10·30 分钟）
- 错过提醒横幅（前台被节流错过触发时提示）
- 重复提醒（每天 / 工作日 / 自定义星期）
- 提示音选择与试听、自定义录音（最长 30 秒）
- 卡通动物表情包提醒 + 自定义表情图片导入
- 深色模式（跟随系统 / 浅色 / 深色）
- 自动备份快照（最多 10 条，可一键恢复）+ JSON 导入导出
- 后续可用 Capacitor 封装为 Android / iOS 应用

## 运行方式

在当前目录执行：

```bash
node server.js
```

然后在浏览器打开本地地址（默认 http://localhost:5173）即可。

## 项目结构（模块化）

```
index.html              页面结构与脚本入口
app/styles.css          全部样式（含深色模式与动效）
app/storage.js          IndexedDB 大对象仓库（录音/表情图片）
app/core.js             数据层：常量、存储、迁移、重复规则、自动备份
app/ui.js               通用 UI 与页面渲染（今天/预告/日历/详情/错过横幅）
app/editor.js           新建/编辑表单（chips、重复规则、自定义录音）
app/reminder.js         到点提醒（轮询、弹层、播报、铃声、贪睡、错过扫描）
app/settings.js         设置页（主题、备份、语音包、导入导出、原生权限引导）
app/main.js             启动装配
server.js               本地静态服务器
build-www.js            Capacitor web 资源构建（复制模块 + 注入原生桥接）
test_runtime.js         运行时集成测试（Node DOM 桩）
e2e_test.js             E2E 测试（Playwright + Chromium）
android/                 Android 原生工程（AlarmManager 闹钟 + 离线 TTS）
```

## 测试

```bash
npm test          # 运行时集成测试（Node 环境，无需浏览器）
npm run test:e2e  # E2E 测试（需 Playwright 浏览器）
npm run test:all  # 两者都跑
```

## 数据可靠性设计

- 事件数据（小体积）存 localStorage。
- 录音与自定义表情（大体积 base64）自动迁移到 IndexedDB，事件里只保留 `rec:<id>` / `emoji:<uid>` 引用，避免撑爆 localStorage 配额。
- 每次保存事件都会写入最新备份快照，并按需滚动保留 10 条历史快照，可在「设置 → 自动备份」一键恢复。

## Android / iOS 扩展建议

如果你要继续打包成真正的原生 App，建议下一步接入：

- Capacitor：把网页壳打包成 Android / iOS
- 本地通知插件：实现后台提醒
- 音频插件：实现语音包播放与录音
- 本地存储：保存事件、表情包和语音选择

## 当前功能

- 今日事件列表、预告列表、月历视图
- 新建和编辑事件（重复规则多选）
- 表情包单选 + 自定义图片导入
- 提示音单选 + 自定义录音
- 到点全屏提醒（完成 / 贪睡 / 关闭）
- 错过提醒横幅
- 自动备份与恢复、JSON 导入导出
- 深色模式与动效
