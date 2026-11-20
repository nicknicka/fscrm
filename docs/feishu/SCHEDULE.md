# 通讯录定时同步配置

`npm run feishu:sync-contacts` 会加载 `.env.local`、执行同步、退出；
成功返回 0，失败返回非 0，适合被 cron 定时调用。

## 方式一：系统 crontab（本机运行）

编辑 crontab：

```bash
crontab -e
```

加入下面一行（每天凌晨 2:00 同步；按需调整）：

```
0 2 * * * cd /Users/nickxiao/Documents/fscrm && /opt/homebrew/bin/npm run feishu:sync-contacts >> /Users/nickxiao/Documents/fscrm/.npm-cache/sync-cron.log 2>&1
```

说明：

- 用绝对路径（cron 环境的 PATH 很精简）。`node`/`npm` 路径可用 `which npm` 查。
- 日志写到已 gitignore 的 `.npm-cache/` 下，不入库。
- 若机器休眠，cron 不会补跑错过的时间；可改用 `launchd`（macOS）以获得更稳定的调度。

## 方式二：Vercel Cron（部署到 Vercel 时）

若部署到 Vercel，需要一个 HTTP 端点供 Vercel 定时调用。由于同步需要凭证且不应公开，应加一个密钥校验。

1. 在 `vercel.json` 配置：

```json
{
  "crons": [{ "path": "/api/cron/sync-contacts", "schedule": "0 2 * * *" }]
}
```

2. 在 `.env.local` / Vercel 环境变量加一个 `CRON_SECRET`，端点校验 `Authorization: Bearer <CRON_SECRET>`（Vercel Cron 会自动带上）。

> 当前项目尚未实现该 HTTP 端点；如需部署到 Vercel 并定时同步，请告知，我会补上
> `src/app/api/cron/sync-contacts/route.ts`（含密钥校验）。本机 cron 方式现已可用。

## 手动触发

任何时候都可以在「设置」页点「立即同步通讯录」，或命令行运行：

```bash
npm run feishu:sync-contacts
```
