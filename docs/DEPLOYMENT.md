# 部署与运行说明

> 工单：#44（父工单 #22「路线图阶段 4：工程化」）
> 面向读者：运维者（单人即可执行）
> 适用范围：本文描述**如何把 fscrm 跑起来并保持运行**。飞书后台的权限、OAuth 与事件订阅配置分别见
> [`docs/feishu/README.md`](./feishu/README.md)、[`docs/feishu/RUNTIME.md`](./feishu/RUNTIME.md)；
> 验证与轮换流程见本文末尾的「相关文档」一节，本文不重复这些内容。

## 一、结论先行：两个进程

fscrm 在生产环境需要**两个独立的长期运行进程**，二者缺一不可：

| #   | 进程                  | 启动命令                           | 作用                                                                           | 缺失/挂掉的后果                                                            |
| --- | --------------------- | ---------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 1   | Next.js Web 服务      | `npm run build` 后 `npm run start` | 页面、Server Action、飞书 OAuth 回调（`/api/auth/feishu/*`）、消息卡片发送     | 整个 CRM 打不开，所有人无法登录处理业务                                    |
| 2   | 飞书事件长连接 worker | `npm run feishu:events`            | 与飞书开放平台建立 WebSocket 长连接，接收 `im.message.receive_v1` 等事件并分发 | **页面照常可用，但飞书推送的事件被静默丢弃**，见下文「为什么必须单独监管」 |

飞书**没有**用 HTTP 回调把事件推给 Web 服务，而是由独立 worker 主动连出去接事件。因此：

- 该 worker **不能**和 Web 服务合并成一个进程，也**不能**挂在 `npm run start` 里顺带跑；
- 它没有任何“前端页面”能反映它的死活，**必须由进程监管器托管并配置自动重启**，否则挂了没人知道；
- 飞书侧对未送达的事件不会无限重投。worker 不在线期间的事件**不会补发**到上线之后，等于凭空丢失。

## 二、前置条件

1. **Node.js**：与 `package.json` 中 Next.js 16.4 匹配的版本（22 LTS 及以上），并具备 `npm`。
2. **Postgres**：可连接的数据库实例，连接串写入 `DATABASE_URL`。
3. **代码**：部署目录下执行 `npm ci` 安装依赖。
4. **数据库结构**：`npm run db:migrate`（开发/首次）或 `npm run db:push` 同步 schema；`prisma generate` 生成的客户端在 `src/generated/prisma`，`npm run build` 前需已生成。
5. **飞书应用**：已按 [`docs/feishu/README.md`](./feishu/README.md) 开通应用身份权限（`scopes.json` 的 `tenant` 数组）、用户身份权限、机器人能力、事件 `im.message.receive_v1`，事件订阅方式选**「使用长连接接收事件」**，并**已发布版本**。

## 三、环境变量清单

键名与占位符以仓库根目录 [`.env.example`](../.env.example) 为准；真实值**只写入 gitignore 的 `.env.local`** 或部署环境的密钥管理（systemd `EnvironmentFile`、容器 secret、托管平台环境变量）。

| 变量                        | 必需       | 用途                                                                                        | 由哪些进程读取                         |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| `FEISHU_APP_ID`             | 是         | 飞书自建应用 App ID                                                                         | Web、事件 worker、同步脚本、admin 脚本 |
| `FEISHU_APP_SECRET`         | 是         | 飞书自建应用 App Secret（**敏感**）                                                         | 同上                                   |
| `FEISHU_APP_DOMAIN`         | 是         | 飞书 `https://open.feishu.cn`；Lark 用 `https://open.larksuite.com`                         | Web、事件 worker                       |
| `FEISHU_OAUTH_REDIRECT_URI` | 是         | 登录回调地址，须与开放平台登记的重定向 URL **逐字一致**                                     | Web（登录路由）                        |
| `FEISHU_OAUTH_SCOPE`        | 是         | 用户身份 scope，空格分隔，与后台已开通的 user scope 对齐                                    | Web（登录路由）                        |
| `SESSION_SECRET`            | 是         | 会话签名密钥，**至少 32 字符**的独立随机值（`openssl rand -base64 32`）；长度不足会直接抛错 | Web                                    |
| `DATABASE_URL`              | 是         | Postgres 连接串（Prisma 驱动适配器使用）                                                    | Web、事件 worker、同步脚本、admin 脚本 |
| `CRON_SECRET`               | 视部署方式 | 定时通讯录同步端点 `POST /api/cron/sync-contacts` 的 `Authorization: Bearer <CRON_SECRET>` 校验     | Web（定时同步端点；见 `docs/feishu/SCHEDULE.md`） |

关于 `CRON_SECRET` 的现状：

- 该键**已收录**在 [`.env.example`](../.env.example)，并已由 #43 落地；
- 端点 `src/app/api/cron/sync-contacts/route.ts` **已实现**：未配置 `CRON_SECRET` 时**一律返回 503 且不执行同步**（fail closed）；密钥错误返回 401；密钥正确返回 200 与同步摘要；
- 因此**只有采用 Vercel Cron / 云端调度器**触发定时同步的部署**必须**配置 `CRON_SECRET`。若走本机 crontab / systemd timer 直接执行 `npm run feishu:sync-contacts`，则不经过该端点，也就无需该变量；
- 配置方式、`vercel.json` 示例与逐条验证命令见 [`docs/feishu/SCHEDULE.md`](./feishu/SCHEDULE.md)。

## 四、凭证安全规则（必须遵守）

- 真实凭证（`FEISHU_APP_SECRET`、`SESSION_SECRET`、数据库密码、访问令牌、Cookie）**只**写入 gitignore 的 `.env.local`，或部署环境的密钥管理系统；**绝不提交到仓库**。`.env.example` 只保留空占位符。
- **不要**把 Secret 写进日志、终端历史、issue、PR、聊天记录、测试快照或交接文档；排查时只记录变量名、错误码、时间与环境。
- **不要** `cat .env.local`，也不要把环境变量整段 `env | grep` 打印出来；确认配置存在只检查“是否非空”，不输出值。
- `SESSION_SECRET` 必须是**独立随机**值，**不得复用**飞书应用凭证；长度不足 32 字符时 `src/lib/auth/session.ts` 会拒绝签名。
- `FEISHU_APP_SECRET` 在飞书后台轮换后，**Web 进程与事件 worker 都要重启**，否则进程内单例仍持有旧凭证/旧令牌。完整轮换步骤与复验见 [`docs/feishu/SECRET-ROTATION.md`](./feishu/SECRET-ROTATION.md)。
- 部署目录、`.env.local` 权限建议 `chmod 600`，属主限定为运行服务的系统用户。

## 五、单机常驻示例：systemd

下面给出**一种**可落地的做法：用 systemd 托管两个进程。两个 unit 共用同一个 `EnvironmentFile`，因此 Secret 只存在一份文件里，且不进仓库。

> 以 Linux 服务器为例，`fscrm` 为运行服务的系统用户，部署目录为 `/srv/fscrm`。按实际环境替换路径与用户名；非 systemd 环境（如 macOS）可把同样的两条命令放进 `launchd` 或 `pm2`，关键点是**两个进程分别托管 + 失败自动重启**。

### 5.1 首次构建（部署目录下执行一次）

```bash
cd /srv/fscrm
npm ci
npm run db:migrate         # 或按团队约定使用 db:push
npm run build              # 生产构建；构建完成后才可用 npm run start
```

### 5.2 环境文件（只放变量，权限 600）

```bash
sudo install -m 600 -o fscrm -g fscrm /dev/null /etc/fscrm/env
sudo -u fscrm "$EDITOR" /etc/fscrm/env   # 按 .env.example 逐行填入真实值
```

内容形如（下面是**示意**，不要写入真实值）：

```ini
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_APP_DOMAIN=https://open.feishu.cn
FEISHU_OAUTH_REDIRECT_URI=https://crm.example.com/api/auth/feishu/callback
FEISHU_OAUTH_SCOPE=contact:user.id:readonly
SESSION_SECRET=
DATABASE_URL=
NODE_ENV=production
```

### 5.3 Web 服务 unit

`/etc/systemd/system/fscrm-web.service`：

```ini
[Unit]
Description=fscrm web (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=fscrm
WorkingDirectory=/srv/fscrm
EnvironmentFile=/etc/fscrm/env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
# 连续快速失败时退避，避免无限重启刷日志
StartLimitIntervalSec=300
StartLimitBurst=10
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

`npm run start` 即 `next start`，默认监听 3000 端口；如需对外提供服务，前方放 Nginx/Caddy 反向代理并终止 TLS（生产环境会话 Cookie 会自动带 `Secure`，因此**必须走 HTTPS**）。

### 5.4 飞书事件长连接 worker unit

`/etc/systemd/system/fscrm-events.service`：

```ini
[Unit]
Description=fscrm Feishu event long-connection worker
After=network-online.target fscrm-web.service
Wants=network-online.target

[Service]
Type=simple
User=fscrm
WorkingDirectory=/srv/fscrm
EnvironmentFile=/etc/fscrm/env
ExecStart=/usr/bin/npm run feishu:events
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=10
# 脚本自行处理 SIGTERM：关闭 WSClient 与 Prisma 连接后退出
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

说明：

- `Restart=always` + `RestartSec=5` 覆盖进程崩溃、OOM 被杀、依赖连接断开后 SDK 未能自愈等场景；SDK 内部已开 `autoReconnect` 处理网络抖动，unit 级重启兜住的是**进程退出**这一类。
- `npm run feishu:events` 内部对 `SIGINT`/`SIGTERM` 有优雅关闭逻辑（关闭长连接、断开数据库），因此 `KillSignal=SIGTERM` 是安全的。
- 若密钥轮换后需要两个进程都重载凭证：`sudo systemctl restart fscrm-web fscrm-events`。
- worker 与 Web **必须在同一份代码版本上运行**（同一部署目录）；只重启其一、让另一个跑旧代码，事件处理逻辑会与业务写入逻辑不一致。

### 5.5 启用与开机自启

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fscrm-web.service fscrm-events.service
```

### 5.6 日志查看（journalctl）

两个进程都输出到 journald，按 unit 分别过滤：

```bash
# 实时跟踪事件 worker 日志
sudo journalctl -u fscrm-events -f

# 最近的 Web 日志
sudo journalctl -u fscrm-web -n 200 --no-pager

# 查看某个时间段（含重启原因，如 OOM、异常退出码）
sudo journalctl -u fscrm-events --since "2026-11-21 10:00" --until "2026-11-21 12:00"

# 看进程是否在重启循环（次数多说明一直在崩）
systemctl show fscrm-events -p NRestarts
```

在日志里应该能看到的关键行（用于判断“活着且在干活”）：

| 进程           | 正常日志                                                                                                                                                     | 异常信号                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `fscrm-events` | `[fscrm] 正在启动飞书事件长连接...` → `[fscrm] 长连接已启动，等待飞书事件推送` → SDK 的 `[ws] ws client ready`；收到消息时打印 `[feishu:event] 收到消息 ...` | `[fscrm] 启动失败:`（多为凭证未配置）、`[feishu:event] 启动事件长连接失败`、反复 `NRestarts` 递增 |
| `fscrm-web`    | Next.js 启动日志与 HTTP 访问日志；`[feishu:notify]` 相关的发送结果                                                                                           | 500 密集出现、`SESSION_SECRET` 长度不足的报错                                                     |

> 注意：日志里不要出现 Secret。若为了排查临时打开 SDK 的 debug 日志，排查完要关掉，并确认输出中不含 `app_secret`。

## 六、其他部署形态

- **容器**：思路相同——Web 镜像与事件 worker 镜像（可用同一镜像、不同 `CMD`）各起一个长期容器，容器编排负责重启策略（Docker `--restart=always`、Compose `restart: always`、K8s `Deployment` + liveness probe）。不要把两个进程塞进同一个容器。
- **托管平台**（如 Vercel）：Web 服务可直接托管，但**平台不会托管长连接 worker**，事件 worker 仍需一台常驻机器（或容器）来跑；此时定时同步可用 Vercel Cron + `CRON_SECRET`（见第三节）。
- **本机开发**：`npm run dev` 起 Web，另开一个终端 `npm run feishu:events`。两者都读 `.env.local`（脚本通过 `scripts/env-bootstrap.ts` 加载）。

## 七、部署后健康检查

按顺序检查，每一步都有明确的判定标准：

### 7.1 Web 进程

```bash
systemctl is-active fscrm-web          # 期望：active
```

浏览器（或 `curl -sS -o /dev/null -w '%{http_code}'`）访问 `https://<域名>/login`，期望返回 200 并渲染登录页。未登录访问业务页应被重定向到 `/login`，这本身也是会话链路可用的佐证。

### 7.2 数据库连通与结构

```bash
cd /srv/fscrm && npm run db:migrate
```

期望无待应用的迁移、无报错。若此处报连接错误，`DATABASE_URL` 或网络策略有问题，先解决再继续。

### 7.3 事件 worker

```bash
systemctl is-active fscrm-events       # 期望：active
sudo journalctl -u fscrm-events -n 50 --no-pager | grep -E "长连接已启动|ws client ready"
```

期望看到启动成功日志，且 `systemctl show fscrm-events -p NRestarts` 的计数稳定（不再递增）。

### 7.4 端到端四链路

上面的检查只证明“进程在跑”。登录、消息卡片、长连接事件、通讯录同步这四条真实链路，请按 [`docs/feishu/E2E-CHECKLIST.md`](./feishu/E2E-CHECKLIST.md) 逐项执行并填写记录模板；判定口径以该清单为准，`npm test` 通过**不能**替代真机验证。

## 八、首次管理员任命（管理员 bootstrap）

新部署完成后，库里没有任何管理员，此时按以下顺序操作：

```bash
cd /srv/fscrm
# 1. 同步飞书通讯录，把用户（含 feishuOpenId）写入数据库
npm run feishu:sync-contacts

# 2. 按飞书 open_id 任命首位管理员（open_id 从飞书通讯录获取，不要写进仓库/文档）
npm run admin -- grant --open-id <飞书用户open_id>
# 也可按 CRM 用户内部 ID 任命：
# npm run admin -- grant --id <用户内部ID>
```

要点：

- 两个脚本都通过 `scripts/env-bootstrap.ts` 加载部署目录下的 `.env.local`（这是它们默认读取的唯一变量文件）。因此有两种做法，任选其一：
  1. **推荐**：在部署目录放一份同样 gitignore、权限 600 的 `.env.local`，直接 `sudo -u fscrm npm run feishu:sync-contacts`；
  2. 若坚持只用 `/etc/fscrm/env`，用 systemd 一次性单元把变量注入（避免在 shell 里手工展开变量）：

     ```bash
     sudo systemd-run --unit=fscrm-sync-contacts --wait --collect \
       --uid=fscrm --working-directory=/srv/fscrm \
       -p EnvironmentFile=/etc/fscrm/env \
       /usr/bin/npm run feishu:sync-contacts
     ```

  `npm run admin -- ...` 同理，把最后一段换成 `/usr/bin/npm run admin -- grant --open-id <open_id>`。两种做法都不要 `echo` 变量、不要开 `set -x`。

- 同步成功会打印 `[fscrm] 同步完成：部门 N 个，人员 M 个`，以及数据库当前用户数；失败以非 0 退出并打印错误。
- 任命成功后，该用户通过飞书 OAuth 登录即可进入 CRM，并在「设置 → 用户与角色」任免其他管理员。
- 撤销用 `npm run admin -- revoke --open-id <open_id>` / `--id <内部ID>`。
- 若同步后部门数为 0 而人员正常，说明应用未授予部门可见范围，属预期降级，不算失败（见 [`docs/feishu/RUNTIME.md`](./feishu/RUNTIME.md)）。

## 九、日常运维要点

### 9.1 已上线进程的“活着”不等于“在干活”

`systemctl is-active` 只能证明进程没退出。**事件 worker 还活着但飞书侧未连上**（例如密钥被轮换、后台取消了长连接订阅方式、网络策略拦了 WebSocket）时，进程不会退出，事件却收不到。建议把 7.3 的 `ws client ready` 日志行纳入日常检查，或每隔一段时间用真实账号给机器人发一条消息，确认出现 `[feishu:event] 收到消息`。

### 9.2 为什么事件 worker 必须单独监管

- 它没有可访问的健康端点，页面上也看不到它，**挂掉唯一的表现是“事件再也不来”**；
- 飞书不会为离线期间的推送无限重试，事件丢失后**无法从 CRM 侧补回**；
- 因此本工单给出两个硬性要求：**独立 systemd unit（或等价容器策略）+ `Restart=always`**，以及**把 `ws client ready` 日志/定期自测纳入巡检**。

### 9.3 升级发布顺序

```bash
cd /srv/fscrm
git fetch --tags && git checkout <目标版本>
npm ci
npm run db:migrate          # 先迁移，再切换代码运行
npm run build
sudo systemctl restart fscrm-web fscrm-events
```

两个进程一起重启，避免新旧代码混跑。若迁移不可回滚，先备份数据库。

### 9.4 OAuth state 一次性校验依赖数据库（多实例部署约束）

飞书登录的一次性 `state` 校验**不再放在进程内存里**，而是存在数据库表 `oauth_states`（#46）：

| 环节                      | 行为                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 登录（`/api/auth/feishu/login`） | 生成 state 后写入一行 `oauth_states`（`state` 唯一，`expiresAt` = 当前时间 + 10 分钟）              |
| 回调（`/api/auth/feishu/callback`） | 用原子 `DELETE ... WHERE state = ? AND expiresAt >= now()` 消费；删除到行才算成功，否则按 `invalid_state` 拒绝 |
| 过期记录清理              | **每次消费时顺手删除所有 `expiresAt < now()` 的行**，无需额外的定时任务                                      |

由此带来的部署约束：

- **所有处理登录/回调的 Web 实例必须连同一个数据库**。多实例（负载均衡、多副本容器、滚动发布中新旧 Pod 并存）只有在共享 `DATABASE_URL` 的前提下才能保证「同一 state 全局只能成功一次」；连线到不同库的实例各自为政，重放仍可能成功。
- **上线顺序**：本迁移（`20261122090000_add_oauth_state`）必须先于新代码应用。旧代码不读写该表，可继续运行；但新代码在表不存在时，登录会返回 500 `state_store_failed` 并记录日志 `[auth:feishu] 登记 OAuth state 失败`。
- **重启 / 扩缩容不影响已签发的 state**：进程重启不再丢记录，10 分钟内回调仍可完成。反过来，这也意味着**不能靠重启来使某个 state 失效**。
- **清理预期**：`oauth_states` 的体量约等于「近 10 分钟内发起的登录次数」，消费时即回收。若某段时间登录很少、没有任何回调，过期行会滞留在表里，直到下一次消费把它们一并删掉——这不影响安全（过期行不可消费），只是行数暂时偏多。需要时可按 `expiresAt` 周期清理：

  ```sql
  DELETE FROM oauth_states WHERE "expiresAt" < now();
  ```

- 该表只存随机 state 与过期时间，不存用户身份或令牌，泄露风险低；但仍应与其他业务表一样纳入数据库备份与访问控制。

## 十、相关文档（不在此重复）

| 内容                                                     | 文档                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 飞书权限导入、OAuth 重定向 URL、事件订阅与机器人能力配置 | [`docs/feishu/README.md`](./feishu/README.md)                                                                          |
| 运行时能力（消息通知、事件长连接、通讯录同步）的接入说明 | [`docs/feishu/RUNTIME.md`](./feishu/RUNTIME.md)                                                                        |
| 通讯录定时同步（crontab / Vercel Cron / 手动触发）       | [`docs/feishu/SCHEDULE.md`](./feishu/SCHEDULE.md)                                                                      |
| App Secret 轮换清单与轮换后复验                          | [`docs/feishu/SECRET-ROTATION.md`](./feishu/SECRET-ROTATION.md)                                                        |
| 真机端到端四条链路的清单与记录模板                       | [`docs/feishu/E2E-CHECKLIST.md`](./feishu/E2E-CHECKLIST.md)                                                            |
| 既往验证记录                                             | [`docs/feishu/VERIFICATION.md`](./feishu/VERIFICATION.md)                                                              |
| 技术栈与部署形态的背景决策                               | [`docs/adr/0001-tech-stack-nextjs.md`](./adr/0001-tech-stack-nextjs.md)                                                |
| 数据库迁移与 schema 维护                                 | [`docs/DATABASE.md`](./DATABASE.md)                                                                                     |

## 十一、本文的边界

- 本文是**部署说明文档**，不包含任何真实凭证；示例 unit 中的路径、用户名、域名均为占位。
- 本文未改动应用代码、脚本或数据库 schema；文中提到的 systemd unit 需运维者在目标机器上自行创建。
- 本文给出的 systemd 方案是**可选示例之一**（工单要求“任选其一并写清”），容器/托管平台的等价做法见第六节。
