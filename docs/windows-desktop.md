# Windows 桌面版

桌面版使用 Electron 封装现有基金助手页面，适配 Windows 10 及以上系统。

## 能力

- 日报、市场、行业、来源、持仓页面。
- 本地持仓录入和导入。
- 支付宝 OCR 文本清洗。
- 点击日报刷新时，直接在本机运行 `scripts/collect_daily.py`。
- 不依赖 GitHub Pages，不需要重新打 APK。

## 开发启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_desktop.ps1
```

首次运行会自动执行：

```powershell
npm.cmd install
```

## 构建 Windows 便携版

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_windows_desktop.ps1
```

输出文件在：

```text
dist/
```

## 日报刷新

在桌面版中点击右上角刷新按钮时：

1. Electron 主进程调用 Python。
2. 运行 `scripts/collect_daily.py`。
3. 写入 `data/daily-news.json` 和 `web/live-data.js`。
4. 前端立即读取最新 JSON 并刷新页面。

如果电脑没有 Python，刷新会失败，需要先安装 Python 3。

## 注意

本工具仅做信息整理和投资辅助，不构成收益承诺或个性化投顾服务。
