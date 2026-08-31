# 绸缪 iOS 版 · macOS 构建与真机测试指南

> 本 iOS 工程已在 Windows 环境完成全部开发与配置，**只需一台 Mac（macOS 14+，Xcode 15+）即可编译运行**。
> 无法在 Windows 上编译 iOS 是 Apple 平台限制（Xcode 仅支持 macOS），与工程本身无关。

---

## 一、iOS 版与 Android 版的差异说明

| 能力 | Android 版 | iOS 版 |
|------|-----------|--------|
| 到点提醒 | 精确闹钟 + 全屏弹窗 + 循环响铃 | ✅ 系统本地通知（声音+横幅） |
| 杀后台后提醒 | 依赖 ROM 白名单 | ✅ **更可靠**：iOS 通知由系统调度，App 被杀也准时触发 |
| App 前台时提醒 | 原生全屏弹窗 | ✅ App 内弹层（含贪睡/完成按钮）+ 语音播报 |
| 语音包 | 离线 AI 语音包（可下载） | 系统内置中文语音（无需下载） |
| 锁屏提醒 | 需手动开启"后台弹窗"权限 | ✅ 系统默认支持，无需额外权限 |
| 权限要求 | 4 项（通知/精确闹钟/全屏/电池） | 仅 1 项：通知权限 |
| 背景色/主题/错过横幅/幻灯片/表情包 | ✅ | ✅ 完全一致 |

> iOS 系统限制说明：iOS 不允许 App 在后台循环响铃或播放自定义语音，通知声音为系统提示音；
> 到点语音播报在 App 前台时生效（App 内弹层出现时用系统 TTS 朗读）。

---

## 二、Mac 上构建步骤

### 1. 拷贝工程
把整个 `shiguang_mobile_app` 文件夹拷贝到 Mac（含 `ios/`、`www/`、`app/`、`node_modules/` 或重新安装依赖）。

### 2. 安装依赖（若未拷贝 node_modules）
```bash
cd shiguang_mobile_app
npm install
```

### 3. 重新同步 web 资源（可选，源码已同步过）
```bash
node build-www.js
npx cap sync ios
```

### 4. 打开工程
```bash
open ios/App/App.xcodeproj
```
> 首次打开会自动拉取 Capacitor Swift Package（需联网），等待 Xcode 顶部进度条完成。

### 5. 设置签名（Apple ID 即可，无需付费开发者账号）
1. Xcode 左侧选中 App 项目 → **TARGETS → App**
2. **Signing & Capabilities** 标签
3. 勾选 "Automatically manage signing"，Team 选择你的 Apple ID
4. 把 **Bundle Identifier** 改成唯一值，如 `com.yourname.shiguang`（否则可能签名冲突）

### 6. 真机运行（免费开发者账号有效 7 天，过期重跑即可）
1. iPhone 数据线连接 Mac，信任电脑
2. Xcode 顶部选你的 iPhone → 点 ▶ Run
3. 手机上：设置 → 通用 → VPN与设备管理 → 信任开发者证书

### 7. 打包 IPA（分享/长期安装）
- 菜单 **Product → Archive** → 完成后 **Distribute App → Ad Hoc** 导出 IPA
- 免费账号也可选 **Development** 导出，安装方式同上

---

## 三、真机测试清单

- [ ] 安装后打开 App → 允许**通知权限**（首次启动会弹窗）
- [ ] 创建事件 → 返回桌面 → 到点：锁屏/通知栏出现提醒 ✓
- [ ] **杀掉 App（上滑关闭）→ 到点：提醒仍准时出现** ✓（iOS 核心优势）
- [ ] App 前台打开时到点：App 内弹出提醒层 + 语音播报 + 贪睡/完成按钮 ✓
- [ ] 背景颜色设置 → 杀掉 App 重开 → 颜色保持 ✓
- [ ] 错过提醒横幅 → 关闭 → 切 App 再回来 → 不重复弹 ✓
- [ ] 设置页 → 权限中心：通知权限状态显示正确

---

## 四、图标与名称

- App 名称：**绸缪**（Info.plist 已配置）
- 图标：已生成 `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`（深绿渐变时钟）
- 想换图标：直接替换该 PNG（1024×1024，不透明）即可

---

## 五、故障排查

| 现象 | 处理 |
|------|------|
| Xcode 报 "Package resolution failed" | 检查网络，Xcode → File → Packages → Resolve Package Versions |
| 签名报错 | 修改 Bundle Identifier 为唯一值；确认登录了 Apple ID |
| 通知不出现 | 检查通知权限；卸载重装后重新允许 |
| 真机 7 天后打不开 | 免费证书有效期 7 天，重新 Run 一次即可 |
| 想换通知声音 | iOS 只支持系统提示音，可在代码 `NativeAlarmPlugin.swift` 中自定义 |

---

## 六、工程结构速览

```
ios/
├── App/
│   ├── App.xcodeproj            # Xcode 工程
│   ├── CapApp-SPM/              # Swift Package 依赖（Capacitor 8.5）
│   └── App/
│       ├── AppDelegate.swift    # 通知代理（前台静默→JS弹层）
│       ├── SceneDelegate.swift  # 场景生命周期
│       ├── NativeAlarmPlugin.swift  # ★ 原生插件（通知/调度/状态栏/权限/语音）
│       ├── Info.plist           # App 名称与配置
│       ├── public/              # Web 资源（已同步最新版）
│       └── Assets.xcassets      # 图标
└── README.md
```
