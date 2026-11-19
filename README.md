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
# 编辑 .env.local，填入 FEISHU_APP_ID / FEISHU_APP_SECRET

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

## 目录结构

```
src/
├── app/            # App Router 页面与路由
└── lib/feishu/     # 飞书开放平台集成封装
```

## 工程约定

- 领域词汇见根目录 [GLOSSARY.md](GLOSSARY.md)，输出中提及领域概念须使用其规范术语。
- 工程技能配置（issue 跟踪、分诊标签、领域文档）见 [AGENTS.md](AGENTS.md) 与 `docs/agents/`。
