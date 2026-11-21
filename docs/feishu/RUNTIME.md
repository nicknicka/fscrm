# 飞书运行时接入：消息通知与事件订阅

本目录说明飞书能力如何真正接入 CRM 业务运行链路。

## 前置条件（飞书开放平台后台）

1. **权限**：已通过 [scopes.json](../feishu/scopes.json) 批量导入并开通。
2. **机器人能力**：应用能力 → 添加「机器人」（否则发消息报 `230006`）。
3. **事件订阅**：事件订阅 → 订阅方式选「使用长连接接收事件」→ 添加事件 `im.message.receive_v1`。
4. **发布版本**：以上配置需创建版本并发布后生效。
5. **凭证**：`.env.local` 中 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 已填。

## 一、消息通知（已在业务中接入）

创建**客户**或**商机**时，若选择了负责人且该负责人已绑定飞书 open_id，会自动发送一张飞书卡片给负责人。

关键实现：

- `src/lib/feishu/message/notify.ts` —— `notifyUser()`：按用户飞书 open_id 发送通知，**失败静默跳过，绝不阻断业务写入**（机器人未发布时业务照常可用）。
- `src/app/(dashboard)/customers/actions.ts` —— 客户创建后发 `customer_created` 卡片。
- `src/app/(dashboard)/opportunities/actions.ts` —— 商机创建后发 `opportunity_created` 卡片。

通知场景与模板定义在 `src/lib/feishu/message/notification.ts`。

**负责人如何绑定飞书**：用户表的 `feishuOpenId` 字段。通讯录同步（`npm run feishu:sync-contacts`）会自动写入该字段；也可通过 `db/feishu-binding.ts` 的 `bindFeishuUser()` 手动绑定。

## 二、事件订阅（长连接）

事件订阅以**独立进程**运行，不依赖 Web 服务器，本地开发无需公网域名。

```bash
# 启动长连接（监听飞书事件）
npm run feishu:events
```

启动后，SDK 与飞书建立 WebSocket 长连接，收到 `im.message.receive_v1` 事件时：

- 提取消息内容（文本/富文本等）；
- 按发送者 open_id 匹配 CRM 用户（身份联动）；
- 输出结构化日志。

当前**不自动创建跟进记录**——因为消息通常没有明确的客户上下文，强行写入会污染数据。识别出的 CRM 用户可用于后续扩展（如指令处理、回复确认）。

停止：按 `Ctrl+C`，会优雅关闭长连接与数据库连接。

## 三、通讯录同步

```bash
npm run feishu:sync-contacts
```

把飞书通讯录的部门与用户同步到 Postgres（`departments` / `users` 表），按飞书 ID upsert，幂等可重复运行。

> 注：若应用未被授予部门可见范围，部门数可能为 0，但用户仍可同步（脚本会自动降级为拉取全部用户）。

## 人工真机验证

下面的清单只列出待操作项，不构成已经验证通过的结论。按真实飞书账号、真实权限与真实数据库重跑时，请使用 [`docs/feishu/E2E-CHECKLIST.md`](./E2E-CHECKLIST.md) 中带时间、环境、结果、错误码和勾选框的记录模板：

- [ ] 飞书 OAuth 登录进入 CRM（参见 `docs/feishu/README.md` 的用户身份权限与重定向 URL 配置）
- [ ] 创建客户时选择已绑定飞书的负责人 → 飞书收到 `customer_created` 卡片
- [ ] 创建商机时选择已绑定飞书的负责人 → 飞书收到 `opportunity_created` 卡片
- [ ] `npm run feishu:events` 启动后，给机器人发消息 → 控制台打印事件日志且匹配到 CRM 负责人
- [ ] `npm run feishu:sync-contacts` → 用户表数据更新并写入 `feishuOpenId`

以上勾选动作对应 `E2E-CHECKLIST.md` 中的四个流程（OAuth 登录、消息卡片、长连接事件、通讯录同步）。记录模板中的四项初始状态均为 **待执行 / 待确认**。
