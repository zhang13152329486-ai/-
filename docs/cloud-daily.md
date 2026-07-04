# 云端日报 JSON 配置

当前方案使用 GitHub Actions 每天生成日报 JSON，并通过 GitHub Pages 发布。

## 发布地址

启用 GitHub Pages 后，日报地址通常是：

```text
https://<你的GitHub用户名>.github.io/<仓库名>/daily-news.json
```

例如：

```text
https://zhangheng.github.io/fund-assistant/daily-news.json
```

## GitHub 设置

1. 把项目推送到 GitHub 仓库。
2. 进入仓库 `Settings`。
3. 打开 `Pages`。
4. 在 `Build and deployment` 中选择 `GitHub Actions`。
5. 进入 `Actions`，手动运行一次 `Daily Fund Report`。
6. 运行成功后打开 Pages 地址，确认能看到 `daily-news.json`。

工作流文件：

```text
.github/workflows/daily-report.yml
```

默认每天北京时间 08:10 运行：

```text
cron: "10 0 * * *"
```

GitHub Actions 使用 UTC 时间，所以 `00:10 UTC` 等于 `08:10 Asia/Shanghai`。

## 写入 App 配置

拿到日报 JSON 地址后运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\set_cloud_daily_url.ps1 -Url "https://<你的GitHub用户名>.github.io/<仓库名>/daily-news.json"
```

然后重新打包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_android_debug.ps1
```

## App 刷新逻辑

App 点击日报右上角刷新按钮时：

1. 优先请求 `web/config.js` 中的 `cloudDailyUrl`。
2. 成功则展示云端日报。
3. 未配置或请求失败时，回退到 APK 内置的离线日报数据。

## 成本

GitHub Actions 和 GitHub Pages 对这个项目的数据量通常够用，按当前用途可以先视为免费方案。
