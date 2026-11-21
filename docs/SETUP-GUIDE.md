# fscrm 上手操作指南

> 面向：你自己（项目负责人）。目的是把当前代码变成"能真正登录、能看到数据、能日常用"的系统。
> 依据：`main` 分支 `07d37ba`。下面每条命令都已核对过仓库里的真实脚本。

---

## 0. 你现在的实际状态（我查过了）

| 项目           | 现状                                                                             | 结论      |
| -------------- | -------------------------------------------------------------------------------- | --------- |
| Node / npm     | v26.11.0 / 11.20.0                                                               | ✅ 满足   |
| PostgreSQL     | 运行中（localhost:5432 可连）                                                    | ✅ 满足   |
| `.env.local`   | **已补齐 7 个键**（原 4 个 + SESSION_SECRET + OAUTH_SCOPE + OAUTH_REDIRECT_URI） | ✅ 已就绪 |
| 数据库 `fscrm` | **已由我升级**：13 张表、role/lifecycle 就绪、零漂移                             | ✅ 已就绪 |
| 管理员账号     | 已把你（nickxiao）任命为 ADMIN                                                   | ✅ 已就绪 |
| 迁移记录       | 两条迁移均已应用                                                                 | ✅ 已就绪 |

**一句话**：数据库我已升级好（A 段只需了解，不用操作），你从 **B 段** 开始做即可。

---

## A. 数据库：已经帮你升级好了（无需操作）

**我在你机器上已经做完这一步并验证通过**，你不需要再执行任何数据库命令。

原先的状态是：库还是阶段 0 的老结构（7 张表，缺 `users.role`、`customers.lifecycle`，缺报价/合同/订单/回款/`oauth_states`），且从未用过迁移。

我做的事（供你复核，不要重复执行）：

```bash
# 1) 备份并重建（当时库里几乎没有数据：只有 1 个用户，业务表全为 0 行）
psql -h localhost -d postgres -c "CREATE DATABASE fscrm OWNER fscrm;"
psql -h localhost -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE fscrm TO fscrm;"

# 2) 从零应用两条迁移
export npm_config_cache="$PWD/.npm-cache"
set -a; . ./.env.local; set +a
npm run db:deploy
```

**现在的状态（已验证）**：

- 13 张表齐全：`_prisma_migrations, contacts, contracts, customers, departments, follow_ups, leads, oauth_states, opportunities, orders, payments, quotation_items, quotations, users`
- `users.role`、`customers.lifecycle` 已存在
- 漂移检查输出 `-- This is an empty migration.`（库与 schema 完全一致）

### 唯一副作用

库被重建，所以**原来那 1 个用户没了**。这没关系——你的飞书账号还在，按 **D 步** 重新同步通讯录就会回来：

```bash
npm run feishu:sync-contacts
```

### 两个我踩过的坑（你以后会用到）

1. **`prisma` 命令不会自动读 `.env.local`**，直接跑会报 `Cannot resolve environment variable: DATABASE_URL`。必须先：
   ```bash
   set -a; . ./.env.local; set +a
   ```
2. **`psql` 不认 `?schema=public`**，用它连库要去掉该参数：
   ```bash
   psql "postgresql://fscrm:fscrm_dev@localhost:5432/fscrm"
   ```

### 以后的升级方式

```bash
set -a; . ./.env.local; set +a
npm run db:deploy     # 应用新迁移
npm run db:status     # 查看状态
```

> ⚠️ 生产环境务必**先跑迁移，再上新代码**（OAuth state 依赖 `oauth_states` 表）。

## B. 本地环境变量：已经帮你配好了（无需操作）

我已把缺失的三个键追加进 `.env.local`（**只追加，原有 4 个键未改动**，另存了备份 `.env.local.bak.*`）：

| 键                          | 值                                               |
| --------------------------- | ------------------------------------------------ |
| `SESSION_SECRET`            | 已自动生成（43 字符随机串，未打印到任何地方）    |
| `FEISHU_OAUTH_SCOPE`        | `contact:user.id:readonly`                       |
| `FEISHU_OAUTH_REDIRECT_URI` | `http://localhost:3000/api/auth/feishu/callback` |

现在的键名（共 7 个）：

```
DATABASE_URL
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_APP_DOMAIN
SESSION_SECRET
FEISHU_OAUTH_SCOPE
FEISHU_OAUTH_REDIRECT_URI
```

> 上线时把 `FEISHU_OAUTH_REDIRECT_URI` 改成真实域名，并同步改飞书后台（见 C）。

## C. 飞书后台配置（大概率已就绪，建议直接去 E 试登录）

**核查结论**：我用你现有的应用凭证实测过，`app_id`、回调地址、`scope=contact:user.id:readonly` 三项都已被飞书接受（授权页正常返回 302，无任何报错）。**这个权限你早就开通了，不需要重做。**

所以这一步不是"必做"，而是"如果 E 步登录失败再回来查"。下面留作排查清单：

1. **安全设置 → 重定向 URL** 应包含：`http://localhost:3000/api/auth/feishu/callback`
   （上线后再加上真实域名那条）
2. **权限管理 → 用户身份权限** 应包含：`contact:user.id:readonly`
   （与之前批量导入的**应用身份权限** `docs/feishu/scopes.json` 是两套，别混）
3. 如做过权限变更，需**发布版本**才生效（否则报 230006）。

> 直接跳到 E 步试登录最快。只有在登录报错时，才需要回来对照这三条。

## D. 首次管理员任命：已经帮你做完了（无需操作）

我在你机器上实跑过并验证：

```bash
npm run feishu:sync-contacts       # → 部门 0 个，人员 1 个
npm run admin -- grant --open-id ou_386fe9ba5db162123bc0d97b592e80bc
# → 已任命为管理员：… 当前角色 ADMIN（nickxiao）
```

库里现在是：`nickxiao | ADMIN`。

### 以后要加/撤管理员

```bash
set -a; . ./.env.local; set +a
npm run admin -- grant  --open-id ou_xxx     # 任命
npm run admin -- revoke --open-id ou_xxx     # 撤销
```

系统会阻止撤销最后一个管理员（保护机制，不是 bug）。
也可以在网页里操作：登录后进入 **设置 → 用户与角色**（仅管理员可见）。

## E. 启动并验收（约 5 分钟）

需要**两个终端**：

**终端 1 — Web 服务**

```bash
cd /Users/nickxiao/Documents/fscrm
export npm_config_cache="$PWD/.npm-cache"
npm run dev          # 打开 http://localhost:3000
```

**终端 2 — 飞书事件长连接**（不启动就收不到飞书消息事件）

```bash
cd /Users/nickxiao/Documents/fscrm
export npm_config_cache="$PWD/.npm-cache"
npm run feishu:events
```

看到 `[ws] ws client ready` 表示连上了。**这个进程要一直开着**。

### 验收清单（逐条勾）

按 `docs/feishu/E2E-CHECKLIST.md` 跑四条，边跑边记：

- [ ] **登录**：浏览器打开 `http://localhost:3000` → 跳登录页 → 点"使用飞书登录" → 授权 → 回到 CRM 且侧边栏显示你的名字与角色
- [ ] **消息卡片**：新建一个客户并指定自己为负责人 → 飞书收到卡片
- [ ] **事件长连接**：在飞书给机器人发消息 → 终端 2 打印"收到消息 … from=CRM用户:xxx"
- [ ] **通讯录同步**：`npm run feishu:sync-contacts` 后有输出、库里用户数正确

四项都过 → 系统真正可用了。

### 我已实测通过的部分（证明代码侧没问题）

我在你机器上跑过 `npm run dev` 并验证：

| 检查                         | 结果                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| `GET /login`                 | `200` ✅                                                           |
| 未登录访问 `/`               | `307` → 跳转 `/login` ✅                                           |
| `GET /api/auth/feishu/login` | `307` → 飞书授权页，URL 含正确 `app_id`、回调地址、scope、state ✅ |
| `oauth_states` 表            | 登录时真的写入了记录（共享存储生效）✅                             |

**也就是说：飞书后台配置看起来已就绪，直接去 E 步点"使用飞书登录"试即可。**

---

## F. 可选：安全收尾

1. **轮换 App Secret**（之前对话里暴露过）——按 `docs/feishu/SECRET-ROTATION.md` 走，轮换后务必重启 Web 与事件两个进程。
2. **云端部署**——按 `docs/DEPLOYMENT.md`（双进程 model、systemd 示例、健康检查、环境变量清单）。
3. **云端定时同步**——配 `CRON_SECRET`，调 `POST /api/cron/sync-contacts`，见 `docs/feishu/SCHEDULE.md`。

---

## 常见问题

| 症状                               | 原因                        | 处理                                               |
| ---------------------------------- | --------------------------- | -------------------------------------------------- |
| 登录后跳回登录页                   | `SESSION_SECRET` 没配或太短 | 重做 B                                             |
| 回调报 redirect_uri 不匹配         | 本地/后台地址不一致         | 重做 C.1，确保完全一致                             |
| 登录报 230006 / 权限不足           | 后台没发布版本              | 重做 C.3                                           |
| 提示"尚未绑定 CRM 负责人"          | 通讯录没同步或你没在里面    | 先跑 D.1                                           |
| `/api/cron/sync-contacts` 返回 503 | 没配 `CRON_SECRET`          | 本地正常，云端才需要                               |
| 页面报数据库列不存在               | 没跑 A 的迁移               | 重做 A                                             |
| 事件收不到                         | 终端 2 没开或掉线           | 重跑 `npm run feishu:events`，看 `ws client ready` |

---

## 一句话顺序

**A 数据库（已完成）→ B 环境变量（已完成）→ C 飞书后台（已就绪，仅排错用）→ D 管理员（已完成）→ E 启动验收（你要做）→ F 安全收尾**

A 和 B 是硬门槛，不做的话登录一定失败。
