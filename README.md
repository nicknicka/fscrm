# fscrm

基于 **Next.js**（App Router + TypeScript + Tailwind CSS）的 **CRM 系统**，对接**飞书**开放平台，实现客户、线索、商机等销售业务管理，并通过飞书机器人、消息卡片与事件订阅打通沟通与协作。

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

## 飞书接入说明

- 在[飞书开放平台](https://open.feishu.cn)创建**企业自建应用**，获取 `App ID` / `App Secret`。
- 凭证通过环境变量注入，见 [.env.example](.env.example)：
  - `FEISHU_APP_ID` / `FEISHU_APP_SECRET`：应用凭证
  - `FEISHU_APP_DOMAIN`：飞书用 `https://open.feishu.cn`（默认）；Lark 用 `https://open.larksuite.com`
- 客户端封装位于 `src/lib/feishu/client.ts`，进程内单例，自动复用令牌缓存。
- 调用飞书接口前请先检查 `isFeishuConfigured`，凭证缺失时避免直接调用。

## 服务端会话设置

- `SESSION_SECRET` 必须配置为至少 32 个字符的独立随机值，可用 `openssl rand -base64 32` 生成；不要复用飞书应用凭证。
- 会话签名与校验位于 `src/lib/auth/session.ts`，当前负责人、姓名与角色通过签名载荷传递，受保护入口统一用 `getCurrentUser()` 读取。
- 会话 Cookie 固定为 `HttpOnly` + `SameSite=Lax`，生产环境自动启用 `Secure`；退出登录调用 `clearSession()` 清除 Cookie。
- 飞书 OAuth 登录回调已接入：未登录访问业务页面会跳转登录页，飞书授权成功后按 `open_id` 匹配 CRM 负责人并签发签名会话；未绑定用户会看到明确提示。
- 业务数据按负责人/角色过滤已实现：管理员可查看和处理全部客户、线索、商机，普通负责人只能处理本人负责的数据；客户、线索、商机的新建与写操作均由 Server Action 从会话重新鉴权。
- 手动通讯录同步同样受会话保护；登录所需的用户身份 scope 与后台权限配置见 [docs/feishu/README.md](docs/feishu/README.md)。

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
├── app/            # App Router 页面与路由
└── lib/feishu/     # 飞书开放平台集成封装
```

## 工程约定

- 每次 push 与 PR 都会触发 CI 质量门（`npm test` → `npm run typecheck` → `npm run lint` → `npm run build`），不依赖任何真实凭证；本地等价命令与排查方法见 [docs/CI.md](docs/CI.md)。
- 领域词汇见根目录 [GLOSSARY.md](GLOSSARY.md)，输出中提及领域概念须使用其规范术语。
- 工程技能配置（issue 跟踪、分诊标签、领域文档）见 [AGENTS.md](AGENTS.md) 与 `docs/agents/`。
