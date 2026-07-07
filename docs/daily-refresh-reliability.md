# 每日云端刷新可靠性说明

## 当前结论

手机 App 的“刷新”只是读取云端 `daily-news.json`。如果 GitHub Actions 没有先生成当天文件，手机端刷新只能看到旧日报。

这几天排查结果：

- Workflow 状态是 `active`。
- 仓库默认分支是 `master`，workflow 文件也在默认分支。
- `push` 和手动运行能触发成功。
- `schedule` 不是完全不能跑，但触发次数远少于 cron 应有次数。
- GitHub Pages 部署偶尔会返回临时失败：`Deployment failed, try again later.`

所以根因不是 App，也不是采集脚本，而是 GitHub Actions 的 `schedule` 触发本身不保证必达。

GitHub 官方文档说明：`schedule` 事件在高负载时可能延迟；负载足够高时，排队任务可能被丢弃。官方也建议避开整点等高峰分钟。

## 已做的改动

`.github/workflows/daily-report.yml` 现在有四种触发方式：

1. `workflow_dispatch`：GitHub 页面手动运行。
2. `push`：推送代码时自动运行。
3. `schedule`：GitHub 内部定时运行，使用低峰分钟重试。
4. `repository_dispatch`：给外部定时器调用的兜底入口。

当前 GitHub 内部定时：

- 北京时间 08:11、08:29、08:47、09:11、09:29、09:47、10:11、10:29、10:47。
- 北京时间 13:11、13:29、13:47 至 17:47。

## 推荐最终方案

如果只靠 GitHub 内部 `schedule`，仍然可能漏。要稳定，建议增加一个外部免费定时器，每天早上调用 GitHub 的 `repository_dispatch` 接口。

推荐免费方案：

- cron-job.org
- Cloudflare Workers Cron Triggers
- 自己电脑 Windows 任务计划程序

外部触发接口：

```text
POST https://api.github.com/repos/zhang13152329486-ai/-/dispatches
```

请求头：

```text
Accept: application/vnd.github+json
Authorization: Bearer <你的 GitHub Token>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

请求体：

```json
{
  "event_type": "daily-report"
}
```

这个接口触发后，会执行同一个日报 workflow，生成：

- `daily-news.json`
- `live-data.js`
- `fund-manager-data.json`
- `fund-manager-data.js`

## 每天如何判断是否成功

打开：

```text
https://zhang13152329486-ai.github.io/-/daily-news.json
```

看 `generatedAt` 是否是当天日期。

手机 App 刷新后，如果显示的日期仍是昨天，说明云端没有生成当天文件；如果云端已经是当天，App 刷新应能同步到当天。
