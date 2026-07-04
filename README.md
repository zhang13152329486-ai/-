# 国内基金投资建议助手

这是一个面向手机端的国内基金投资建议助手封装体。第一版采用“离线可用 Web/PWA + Android WebView 壳”的结构，复用当前题库 App 的轻量封装思路，但内容和逻辑已经改成基金投资辅助。

## 当前包含

- `web/`：手机端 PWA 页面，可直接预览和安装到桌面。
- `android-webview/`：Android 原生 WebView 封装工程骨架，适配 Android 16/API 36。
- `docs/`：数据源、行业分类、分析方法与后续采集方案。

## 手机端能力

- 每日投资建议报告
- 政策/新闻/资金信号看板
- 每日联网采集结果展示
- 行业评分和基金方向建议
- 国家队与长期资金观察逻辑
- 风险偏好、本地持仓和观察清单
- 离线缓存、本地存储、导入导出

## 预览

```powershell
python -m http.server 4173 -d web
```

然后在浏览器打开：

```text
http://127.0.0.1:4173
```

## 每日自动采集

手动采集一次：

```powershell
python scripts\collect_daily.py
```

注册 Windows 每日 08:10 自动采集任务：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register_daily_collection.ps1
```

采集器会更新：

```text
web/live-data.js
data/daily-news.json
```

Android 打包前同步到壳工程：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\sync-web-to-android.ps1
```

## Android 封装

`android-webview` 已按 Android 16/API 36 配置：

- `compileSdk 36`
- `targetSdk 36`
- `minSdk 26`
- 使用本地 `assets/index.html`
- 开启安全的 HTTPS 外链跳转
- 支持返回键 WebView 导航

本机当前没有 JDK/Android SDK/Gradle，因此我先放好可构建工程。安装 Android Studio 后，可以直接打开 `android-webview` 目录构建；如果你另外安装了 Gradle，在 `android-webview` 目录执行：

```powershell
gradle assembleDebug
```

输出 APK：

```text
android-webview/app/build/outputs/apk/debug/app-debug.apk
```

## 当前成品 APK

当前可安装成品 APK：

```text
dist/FundAssistant-0.2.0-debug.apk
```

这是正规 Android Gradle 工程构建出的 APK，不再是重封装题库 APK。关键元数据：

- 包名：`cn.fundassistant.mobile`
- 应用名：基金助手
- `minSdkVersion 26`
- `targetSdkVersion 36`
- `compileSdkVersion 36`
- 签名：Android debug v2 签名

重新生成成品 APK：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_android_debug.ps1
```

## 重要说明

本工具只做投资辅助和信息整理，不构成收益承诺或个性化投顾服务。基金买卖需结合个人风险承受能力、资金期限、已有持仓和市场波动。
