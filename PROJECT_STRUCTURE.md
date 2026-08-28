# 项目文件说明

- `index.html`：页面结构 + 模块脚本入口
- `app/styles.css`：全部样式（浅色/深色主题、动效）
- `app/storage.js`：IndexedDB 大对象仓库（录音、自定义表情图片）
- `app/core.js`：数据层（事件存储、迁移、重复规则、自动备份）
- `app/ui.js`：通用 UI 与页面渲染
- `app/editor.js`：新建/编辑表单与自定义录音
- `app/reminder.js`：到点提醒、贪睡、错过提醒扫描
- `app/settings.js`：设置页（主题、备份、语音包、导入导出、原生权限引导）
- `app/main.js`：启动装配
- `server.js`：本地静态服务器（浏览器预览）
- `build-www.js`：Capacitor web 资源构建（复制模块到 `www/` + 注入原生桥接）
- `test_runtime.js`：运行时集成测试（Node DOM 桩）
- `e2e_test.js`：E2E 测试（Playwright）
- `capacitor.config.json`：原生壳配置
- `README.md`：运行说明
- `NATIVE_SETUP.md`：Android/iOS 工程落地说明
- `NATIVE_ALARM_SETUP.md`：原生闹钟行为与权限说明
- `NOTIFICATION_ALARM_DESIGN.md`：本地通知与后台闹钟设计
- `android/`：Android Studio 工程（已含原生闹钟与离线 TTS）
- `ios/`：Xcode 工程
- `www/`：`npm run build:www` 生成的 Capacitor web 资源

## 下一步建议

- `assets/`：图标、表情包、声音资源
- 抽离 React/Vue 组件化前端（当前为原生模块化 JS）
