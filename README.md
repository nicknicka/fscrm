# fscrm

基于 **Next.js**（App Router + TypeScript + Tailwind CSS）的 **CRM 系统**，对接**飞书**开放平台。

**分工原则：结构、规则、权限放 CRM，触达与交互放飞书。** 销售不用打开网页——在飞书里 @机器人 说一句话就能落成跟进记录，卡片上的按钮能直接认领客户、推进商机阶段；网页端负责看全局数据、做配置、处理例外。设计决策见 [ADR-0004](docs/adr/0004-feishu-as-operation-entry.md)。

## 技术栈

- **Next.js 16**（App Router）——前后端一体，API Route 直接接飞书回调与服务端逻辑
- **TypeScript 5**——全链路类型，飞书 SDK 自带类型定义
- **Tailwind CSS 4**——样式方案
- **@larksuiteoapi/node-sdk**——飞书开放平台官方 Node SDK

## 快速开始

```bash
# 1. 安装依赖（若尚未安装）
npm install

# 2. 配置飞书凭证（复制后填入真实值，切勿提交真实凭证）
cp .env.example .env.local
# 编辑 .env.local，填入 FEISHU_APP_ID / FEISHU_APP_SECRET 与 SESSION_SECRET

# 3. 本地开发
npm run dev

# 4. 生产构建 / 运行
npm run build
npm run start
```

生产部署需要同时常驻 **Web 服务**与**飞书事件长连接进程**（`npm run feishu:events`）两个进程，常驻方式、重启策略、日志查看、环境变量清单与首次管理员任命见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 飞书接入说明

- 在[飞书开放平台](https://open.feishu.cn)创建**企业自建应用**，获取 `App ID` / `App Secret`。
- 凭证通过环境变量注入，见 [.env.example](.env.example)：
  - `FEISHU_APP_ID` / `FEISHU_APP_SECRET`：应用凭证
  - `FEISHU_APP_DOMAIN`：飞书用 `https://open.feishu.cn`（默认）；Lark 用 `https://open.larksuite.com`
- 客户端封装位于 `src/lib/feishu/client.ts`，进程内单例，自动复用令牌缓存。
- 调用飞书接口前请先检查 `isFeishuConfigured`，凭证缺失时避免直接调用。

### 机器人与交互卡片

- 启动：`npm run feishu:events`（长连接，无需公网域名）。
- 消息入口：在任意会话里 `@机器人 客户云启今天电话聊了，预算80万，下周三要方案` → 机器人解析成结构化跟进并回卡片。
- 卡片按钮：认领公海客户、推进商机阶段等操作**点一下就写库**，卡片原地刷新。
- 开放平台需完成三件事：**添加机器人能力并发布版本**（否则报 `230006`）、订阅 `im.message.receive_v1` 事件、订阅 `card.action.trigger` 回调。
- 身份映射：事件的 `open_id` 必须能匹配到 CRM 用户，否则机器人回「账号未绑定」卡片。绑定方式见下方管理员任命。

### 模型服务（OpenAI 兼容）

模型的唯一用途是把自然语言拆成结构化字段，**客户匹配与写入规则始终在代码里**（模型不能决定写哪个客户）。

- 管理员在 **设置 → 模型服务** 填写 Base URL、模型 ID、API Key，点「保存并测试」即可，无需重启。
- 支持任意 OpenAI 兼容接口，页面内置 DeepSeek / OpenAI / 通义千问 / 智谱 预填。
- API Key 以 AES-256-GCM 加密入库，密钥由 `SESSION_SECRET` 派生；页面与接口只返回掩码。
- 未配置或调用失败时自动退回关键词识别，卡片底部会标注「按关键词识别」提醒核对。

### 主动催办（待办提醒）

系统每天扫描一次，把该做的事推到飞书，而不是等销售想起来去看：

| 信号     | 判定规则                                         |
| -------- | ------------------------------------------------ |
| 跟进超期 | 登记的「下一步时间」已过，且该客户之后没有再跟进 |
| 客户沉默 | 负责的客户超过 14 天没有任何跟进记录             |
| 待回款   | 订单金额减去已登记回款仍有差额                   |

- 按**负责人 × 类别**聚合成一张卡片（同类最多列 5 条明细），避免逐条刷屏。
- 页面：`/reminders`，管理员可「立即推送到飞书」手动触发。
- 定时：`POST /api/cron/reminders`，与通讯录同步共用 `CRON_SECRET` 鉴权，未配置密钥时一律拒绝执行。
- 未绑定飞书的负责人收不到卡片，页面上会明确标注，首页也会显示「N 类因负责人未绑定飞书发不出去」。

### 群绑定

在客户详情页可以把某个飞书群绑定到该客户。之后在这个群里 @机器人 记跟进会自动带出客户名，不用每次念公司名。

**群绑定不改变数据权限**：解析时会核对当前用户是否本来就能看到该客户，看不到则等同没有绑定。

## 服务端会话设置

- `SESSION_SECRET` 必须配置为至少 32 个字符的独立随机值，可用 `openssl rand -base64 32` 生成；不要复用飞书应用凭证。
- 会话签名与校验位于 `src/lib/auth/session.ts`，当前负责人、姓名与角色通过签名载荷传递，受保护入口统一用 `getCurrentUser()` 读取。
- 会话 Cookie 固定为 `HttpOnly` + `SameSite=Lax`，生产环境自动启用 `Secure`；退出登录调用 `clearSession()` 清除 Cookie。
- 飞书 OAuth 登录回调已接入：未登录访问业务页面会跳转登录页，飞书授权成功后按 `open_id` 匹配 CRM 负责人并签发签名会话；未绑定用户会看到明确提示。
- 业务数据按负责人/角色过滤已实现：管理员可查看和处理全部客户、线索、商机，普通负责人只能处理本人负责的数据；客户、线索、商机的新建与写操作均由 Server Action 从会话重新鉴权。
- 手动通讯录同步同样受会话保护；登录所需的用户身份 scope 与后台权限配置见 [docs/feishu/README.md](docs/feishu/README.md)。

### 数据库初始化与升级

数据库结构由 `prisma/schema.prisma` 定义，变更以 `prisma/migrations/` 下的版本化迁移承载：

```bash
npm run db:deploy   # 生产 / 预发：按顺序应用尚未执行的迁移
npm run db:migrate  # 本地开发：改完 schema 后生成并应用一个新迁移
npm run db:push     # 可选：直接把 schema 推到库，不产生迁移文件
```

首次基线迁移为 `prisma/migrations/20261121120000_init`。迁移与 `db push` 的区别、生产上线步骤，以及已有库（用 `db push` 建起来的）如何过渡到迁移，见 [docs/DATABASE.md](docs/DATABASE.md)。

### 首次任命管理员

新部署完成并配置 `.env.local`、数据库初始化后，先同步通讯录创建用户，再任命首位管理员；`open_id` 从飞书通讯录获取，不要写进仓库：

```bash
npm run feishu:sync-contacts
npm run admin -- grant --open-id <飞书用户open_id>
```

也可以用 `npm run admin -- grant --id <用户内部ID>` 按 CRM 用户内部 ID 任命。任命后该用户通过飞书 OAuth 登录，即可在「设置 → 用户与角色」任免其他管理员。

## 目录结构

```
src/
├── app/                    # App Router 页面与路由
│   └── (dashboard)/settings/model/   # 模型服务配置页
└── lib/
    ├── ai/                 # OpenAI 兼容客户端、跟进解析、Key 加密
    ├── reminders/          # 待办扫描与推送
    ├── cron/               # 定时任务端点公共鉴权
    └── feishu/
        ├── bot/            # 机器人：消息流、卡片动作、身份映射、发送
        ├── cards/          # 交互卡片模板
        ├── events/         # 事件订阅与分发
        └── identity/       # OAuth 与身份绑定
```

## 工程约定

- 每次 push 与 PR 都会触发 CI 质量门（`npm test` → `npm run typecheck` → `npm run lint` → `npm run build`），不依赖任何真实凭证；本地等价命令与排查方法见 [docs/CI.md](docs/CI.md)。
- 领域词汇见根目录 [GLOSSARY.md](GLOSSARY.md)，输出中提及领域概念须使用其规范术语。
- 工程技能配置（issue 跟踪、分诊标签、领域文档）见 [AGENTS.md](AGENTS.md) 与 `docs/agents/`。
