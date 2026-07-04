# Android WebView 封装

这个目录是国内基金投资建议助手的 Android 封装工程。

## 适配目标

- Android 16/API 36
- Xiaomi HyperOS 3.x/Android 16 设备
- 竖屏手机优先
- WebView 本地资产离线运行

## 构建前同步 Web 资产

在项目根目录执行：

```powershell
.\scripts\sync-web-to-android.ps1
```

## 构建

需要安装 Android Studio、JDK 17+ 和 Android SDK Platform 36。

如果使用 Android Studio 打开本目录，等待 Gradle 同步完成后点击 Run 即可。

如果你另外安装了 Gradle，可执行：

```powershell
cd android-webview
gradle assembleDebug
```

## 题库 APK 复用结论

当前项目里的 `digital-ops-quiz.apk.1(2).1` 是轻量 WebView/PWA 封装，内部包含 `index.html`、`app.js`、`styles.css`、`questions.js` 和 Service Worker。它的封装方式可以复用，但没有源码工程，且签名不可复用，因此本项目重新创建可维护的 Android WebView 工程。
