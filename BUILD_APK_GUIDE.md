# 📱 绸缪应用 - Android APK 构建指南

## ✅ 项目已完成准备工作

所有 Web 资源已构建完成，Android 项目结构已准备好。

## 🚀 两种 APK 构建方式

### 方式一：使用 Android Studio（推荐，最简单）

#### 步骤 1: 安装 Android Studio
- 下载地址：https://developer.android.com/studio
- 安装包：约 1GB，请预留足够磁盘空间

#### 步骤 2: 导入项目到 Android Studio
1. 打开 Android Studio
2. File → Open → 选择 `android/` 目录
3. 等待 Gradle Sync 完成

#### 步骤 3: 构建 Debug APK
1. Build → Build Bundle(s) / APK(s) → Build APK(s)
2. 等待编译完成
3. APK 位置：`android/app/build/outputs/apk/debug/app-debug.apk`

#### 步骤 4: 复制到桌面
```powershell
Copy-Item "C:\Users\ADMIN\Desktop\新建文件夹\shiguang_mobile_app\android\app\build\outputs\apk\debug\app-debug.apk" -Destination "$env:USERPROFILE\Desktop\"
```

---

### 方式二：命令行构建（高级用户）

#### 前提条件
- 已安装 JDK 17+ 
- 已安装 Android SDK（通过 Android Studio 或单独安装）
- ANDROID_HOME 环境变量已设置

#### 步骤 1: 确保环境配置正确
```powershell
# 检查 Java 版本（需要 JDK 17+）
java -version

# 检查 Android SDK（如果未设置）
$env:ANDROID_HOME = "C:\Users\<你的用户名>\AppData\Local\Android\Sdk"
```

#### 步骤 2: 构建 APK
```powershell
cd C:\Users\ADMIN\Desktop\新建文件夹\shiguang_mobile_app\android

# 清除旧的构建文件（可选）
Remove-Item app\build -Recurse -Force -ErrorAction SilentlyContinue

# 构建 Debug APK
.\gradlew.bat assembleDebug
```

#### 步骤 3: 复制 APK 到桌面
```powershell
Copy-Item "app\build\outputs\apk\debug\app-debug.apk" -Destination "$env:USERPROFILE\Desktop\ShiGuang_Debug.apk"
```

---

## 📂 当前项目状态

✅ **已完成：**
- [x] Web 资源构建 (`www/index.html` + `www/app/`)
- [x] Capacitor 配置 (`capacitor.config.json`)
- [x] Android 项目结构（包含原生闹钟代码）
- [x] 模块化 JavaScript 分离（8 个独立模块）

⏳ **待构建：**
- APK 文件（需要通过 Android Studio 或 Gradle 编译）

---

## 🎯 快速验证脚本

运行此脚本可以一键完成大部分工作（需要 Android Studio 已安装）：

```powershell
# 在新建文件夹/shiguang_mobile_app/tools 目录中
cd tools
.\build_apk_studio.ps1
```

该脚本会：
1. 检测 Android Studio 安装
2. 自动打开项目
3. 触发后台构建
4. 完成后提示 APK 位置

---

## 📱 APK 安装说明

### 在手机上安装
1. 将 APK 文件传输到手机（USB 传输、微信、QQ、网盘等）
2. 在手机上点击 APK 文件
3. 允许"安装未知应用"权限
4. 确认安装

### 测试建议
- ✅ 录音功能：测试麦克风权限
- ✅ 本地通知：测试通知弹出
- ✅ 后台闹钟：划掉 App 后等待时间触发
- ✅ 全屏提醒：锁屏状态下查看

---

## 🔧 故障排查

### 问题 1：Gradle 下载慢/失败
**原因：** 国内网络访问 services.gradle.org 速度慢  
**解决：**
```powershell
# 方法 A: 使用阿里云镜像（在 gradle/wrapper/gradle-wrapper.properties 中修改）
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.14.3-all.zip

# 方法 B: 等待下载完成（首次较慢）
# 方法 C: 手动下载 gradle 包并解压到指定目录
```

### 问题 2：SDK 找不到
**错误：** No Android SDK found  
**解决：**
```powershell
$env:ANDROID_HOME = "C:\Users\YourName\AppData\Local\Android\Sdk"
# 然后重新运行 gradlew
```

### 问题 3：Java 版本不兼容
**错误：** Unsupported class file major version  
**解决：** 需要安装 JDK 17 或更高版本
```powershell
# 下载 Adoptium Temurin JDK 17
# https://adoptium.net/
```

---

## 💡 替代方案：Web 版直接使用

如果你只需要预览效果，可以直接在浏览器中运行：

```powershell
cd C:\Users\ADMIN\Desktop\新建文件夹\shiguang_mobile_app
node server.js
```

然后在浏览器打开：http://localhost:5173

**优点：**
- ✅ 无需任何依赖
- ✅ 立即生效
- ✅ 适合开发调试

**限制：**
- ❌ 无法测试原生闹钟
- ❌ 无法测试全屏提醒
- ❌ 无法测试原生权限

---

## 📞 获取帮助

如有问题，请检查：
1. [Capacitor 官方文档](https://capacitorjs.com/)
2. [Android 构建文档](https://developer.android.com/studio/build)
3. 本项目的 `android/README.md`（如果存在）

祝构建顺利！🎉
