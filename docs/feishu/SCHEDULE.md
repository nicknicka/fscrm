# 通讯录定时同步配置

通讯录同步目前有三种触发方式，全部复用同一个同步服务
（`src/lib/services/contact-sync.ts` 的 `runContactSync()`），行为一致：

| 方式 | 入口 | 适用场景 |
| --- | --- | --- |
| 命令行脚本 | `npm run feishu:sync-contacts` | 本机 cron、一次性手动同步 |
| HTTP 端点 | `POST /api/cron/sync-contacts` | 云端调度器（服务器部署后） |
| 设置页 | 「设置 → 立即同步通讯录」 | 管理员手动触发 |

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

## 方式二：HTTP 端点 + 云端调度器（服务器部署）

服务器部署（Vercel、容器、自建机）后，用下面的端点让调度器定时触发同步。

### 端点契约

```
POST /api/cron/sync-contacts
Authorization: Bearer <CRON_SECRET>
```

- 只接受 `POST`；其它方法由 Next.js 返回 405。
- 认证方式固定为 `Authorization: Bearer <CRON_SECRET>`（与 Vercel Cron 自动携带的头一致）。
- 未配置 `CRON_SECRET`（缺失或空白）时**一律拒绝且不执行同步**，即 fail closed。
- 任何响应都不会回显密钥；响应头带 `Cache-Control: no-store`。

| 情况 | 状态码 | 响应体 |
| --- | --- | --- |
| 未配置 `CRON_SECRET` | 503 | `{ "ok": false, "error": "cron_secret_missing", "message": "…" }` |
| 未带密钥 / 密钥不匹配 | 401 | `{ "ok": false, "error": "unauthorized", "message": "…" }` |
| 同步成功 | 200 | `{ "ok": true, "ranAt": "…", "durationMs": 42, "summary": { "departments": 3, "persons": 7, "totals": { "departments": 3, "users": 7 } } }` |
| 同步失败（含飞书凭证未配置） | 502 | `{ "ok": false, "error": "sync_failed", "message": "…", "ranAt": "…", "durationMs": 5 }` |

状态码语义：401 是「你没资格调」，503 是「服务端没配好，先别调」，502 是
「调用通过但上游（飞书 / 数据库）失败」——调度器与告警可按这三个码区分处理。

### 配置密钥

在服务器 / 云端环境变量里加 `CRON_SECRET`（模板见仓库根目录 `.env.example`）：

```bash
openssl rand -base64 32   # 生成一个独立随机值
```

真实值只放在 `.env.local` 与云端环境变量中，**不要提交到仓库**。

### 本地自测

```bash
# 先起服务：npm run dev
curl -i -X POST http://localhost:3000/api/cron/sync-contacts \
  -H "Authorization: Bearer $CRON_SECRET"

# 预期：无密钥 / 错密钥 → 401；未配置 CRON_SECRET → 503；正确密钥 → 200 + 同步摘要
curl -i -X POST http://localhost:3000/api/cron/sync-contacts
```

### Vercel Cron

在 `vercel.json` 配置定时任务（Vercel 会以 `Authorization: Bearer <CRON_SECRET>`
自动调用，前提是项目环境变量里已设置 `CRON_SECRET`）：

```json
{
  "crons": [{ "path": "/api/cron/sync-contacts", "schedule": "0 2 * * *" }]
}
```

### 其它调度器（GitHub Actions / k8s CronJob / 系统 cron + curl）

任何能发 HTTP 请求的调度器都可以，关键是带上 `Authorization` 头：

```bash
# 每天 02:00（UTC 时区按调度器配置）
curl -fsS -X POST "https://crm.example.com/api/cron/sync-contacts" \
  -H "Authorization: Bearer $CRON_SECRET"
```

`-f` 让非 2xx 变成非 0 退出码，交给调度器的失败告警处理；`-sS` 保持静默但打印错误。
不要把密钥直接写进 crontab 命令行（会被 `ps` 看到），用环境变量或仅 root 可读的脚本文件。

## 手动触发

任何时候都可以在「设置」页点「立即同步通讯录」，或命令行运行：

```bash
npm run feishu:sync-contacts
```

也可以直接调端点（见上面的「本地自测」）。
