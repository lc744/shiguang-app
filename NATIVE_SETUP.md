# 拾光原生工程结构说明

当前项目已经整理为适合接入 Capacitor 的跨平台 App 骨架。它的结构分为三层：

- `index.html`：手机端主界面
- `server.js`：本地预览服务
- `capacitor.config.json`：原生壳配置

## 接入 Android / iOS 的标准步骤

1. 在项目根目录安装 Capacitor 相关依赖
2. 执行 Capacitor 初始化
3. 生成 Android 平台目录
4. 生成 iOS 平台目录
5. 将 `index.html` 替换为正式前端资源构建产物
6. 在 Android Studio 和 Xcode 中分别打开工程

## 推荐原生目录形态

```text
shiguang_mobile_app/
├─ android/
├─ ios/
├─ index.html
├─ server.js
├─ capacitor.config.json
├─ package.json
└─ README.md
```

## 说明

如果你下一步要我继续，我可以直接帮你把：

- Android/iOS 目录结构文件也补齐
- 通知、闹钟、录音、音频播放接口抽出来
- 变成更接近真实发布工程的前端架构
