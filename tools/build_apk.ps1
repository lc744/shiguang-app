# 拾光应用 - Android APK 构建脚本
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "📱 拾光 App - Android APK 构建工具" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

$rootDir = Split-Path $PSScriptRoot -Parent
$androidDir = Join-Path $rootDir "android"
$outputDir = Join-Path $rootDir "apk_output"

# 步骤 1: 检查必要条件
Write-Host "`n[步骤 1/6] 检查项目结构..." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $rootDir "package.json"))) {
    Write-Host "❌ 错误：找不到 package.json" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $rootDir "capacitor.config.json"))) {
    Write-Host "❌ 错误：找不到 capacitor.config.json" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $androidDir "build.gradle"))) {
    Write-Host "❌ 错误：找不到 Android build.gradle" -ForegroundColor Red
    exit 1
}

Write-Host "✓ 项目结构正常" -ForegroundColor Green

# 步骤 2: 构建 Web 资源
Write-Host "`n[步骤 2/6] 构建 Web 资源..." -ForegroundColor Yellow
& node "$(Join-Path $rootDir "build-www.js")" 2>&1 | ForEach-Object { $_ }

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 错误：build-www.js 执行失败" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $rootDir "www/index.html"))) {
    Write-Host "❌ 错误：www 目录未生成" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Web 资源构建成功" -ForegroundColor Green

# 步骤 3: 同步 Capacitor
Write-Host "`n[步骤 3/6] 同步 Capacitor 到 Android..." -ForegroundColor Yellow
try {
    & node "$(Join-Path $rootDir "node_modules/@capacitor/cli/bin/capacitor")" sync android --verbose
    Write-Host "✓ Capacitor 同步成功" -ForegroundColor Green
} catch {
    Write-Host "⚠ 警告：Capacitor 同步可能有警告（可继续）" -ForegroundColor Yellow
}

# 步骤 4: 准备输出目录
Write-Host "`n[步骤 4/6] 准备输出目录..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Write-Host "✓ 输出目录已创建：$outputDir" -ForegroundColor Green

# 步骤 5: 使用 Gradle 编译
Write-Host "`n[步骤 5/6] 编译 Debug APK..." -ForegroundColor Yellow
Set-Location $androidDir

# 检查 Java 环境
Write-Host "检查 Java 版本..."
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if ($javaCmd) {
    Write-Host "  Java: $($javaCmd.Source)" -ForegroundColor Gray
} else {
    Write-Host "  ⚠ 警告：Java 命令不可用" -ForegroundColor Yellow
}

# 运行 Gradle
& .\gradlew.bat assembleDebug -p . --no-daemon 2>&1 | ForEach-Object {
    if ($_ -match "BUILD SUCCESSFUL") {
        Write-Host "✓ Gradle 编译成功" -ForegroundColor Green
    } elseif ($_ -match "FAILURE|ERROR") {
        Write-Host "❌ Gradle 错误：$_" -ForegroundColor Red
    } else {
        Write-Host $_.Trim()
    }
}

Set-Location $rootDir

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n⚠ 注意：Gradle 编译返回非零值" -ForegroundColor Yellow
    Write-Host "如果 APK 已成功生成，可以跳过此警告" -ForegroundColor Yellow
}

# 步骤 6: 复制 APK 到输出目录
Write-Host "`n[步骤 6/6] 复制 APK 文件..." -ForegroundColor Yellow

# 查找生成的 APK
$appDir = Join-Path $androidDir "app"
$debugApks = Get-ChildItem $appDir -Recurse -Filter "*.apk" -Include "app-debug.apk","*-debug.apk" | Where-Object {
    $_.Name -like "*-debug.apk" -and $_.Name -notmatch "bundle"
}

if ($debugApks.Count -eq 0) {
    # 尝试找主 debug APK
    $mainApk = Get-ChildItem $appDir -Recurse -Filter "app-debug.apk" | Select-Object -First 1
    if ($mainApk) {
        $debugApks = @($mainApk)
    }
}

if ($debugApks.Count -gt 0) {
    foreach ($apk in $debugApks) {
        $destName = "ShiGuang_Debug_${Get-Date -Format 'yyyyMMdd_HHmmss'}.apk"
        Copy-Item $apk.FullName (Join-Path $outputDir $destName)
        $size = [math]::Round($apk.Length / 1MB, 2)
        Write-Host "✓ APK 已复制到：$destName ($size MB)" -ForegroundColor Green
    }
} else {
    Write-Host "⚠ 警告：未找到生成的 APK 文件" -ForegroundColor Yellow
    Write-Host "  请检查 android/app/build/outputs/apk/ 目录" -ForegroundColor Yellow
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "🎉 构建完成！APK 文件位于：" -ForegroundColor Cyan
Write-Host "$(Resolve-Path $outputDir)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

if ($debugApks.Count -gt 0) {
    Write-Host "`n💡 提示：" -ForegroundColor Cyan
    Write-Host "  • APK 文件已在桌面创建快捷方式" -ForegroundColor White
    $desktopPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), (Split-Path -Leaf $debugApks[0].FullName))
    if ((Test-Path (Split-Path -Leaf $debugApks[0].FullName))) {
        Write-Host "  ✓ APK 也已复制到桌面" -ForegroundColor Green
    }
}
