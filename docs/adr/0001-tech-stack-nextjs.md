# ADR-0001：技术栈选用 Next.js 全栈

- **状态**：已接受
- **日期**：2026-11-19
- **决策者**：nicknicka

## 背景

fscrm 是一个对接飞书开放平台的 CRM 系统，由单人主导开发。需要一种能同时承载前端界面、服务端逻辑与飞书集成（服务端调用、事件订阅、回调处理）的技术栈，并尽量降低维护心智负担。

## 决策

选用 **Next.js（App Router）** 作为全栈框架，配合 TypeScript 与 Tailwind CSS。飞书集成通过官方 `@larksuiteoapi/node-sdk` 完成，统一在 `src/lib/feishu/` 下封装。

选择理由：

- **一套语言打通全链路**：飞书 Node SDK 原生支持 TypeScript，Next.js 把前端页面、后端 API（Route Handler）和飞书集成层纳入同一套 TS 工具链，无需在 Node 与 Python 之间切换。
- **事件订阅更顺**：飞书事件用 SDK 长连接（WebSocket）接收，本地开发无需暴露公网域名；需要 HTTP 回调的场景用 Next.js 的 Route Handler 承接。
- **类型完备**：SDK 自带类型定义，调用通讯录、消息等接口时不易写错。
- **部署简单**：前后端一体，无需分别部署。

## 影响

- **正面**：开发与部署链路统一，飞书集成与业务代码复用同一套类型与配置，单人维护成本可控。
- **负面**：前后端耦合于一个 Next.js 应用；若未来后端逻辑显著复杂化（如引入独立微服务、异步任务队列），需要重新评估是否拆分。
- 代码结构上，前端页面位于 `src/app/`，飞书集成封装位于 `src/lib/feishu/`。

## 替代方案

- **Python（FastAPI）+ React**：飞书 Python SDK `lark-oapi` 功能对等，适合更熟 Python 的场景；代价是前后端两套语言，单人项目维护负担更高，故未选。
