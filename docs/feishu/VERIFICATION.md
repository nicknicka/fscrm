# 飞书接入端到端验证记录

> 验证时间：2026-11-21
> 应用：`cli_aa75a1d995f8dd24`（fscrm）

## 结论

飞书与 CRM 的三条核心链路**全部端到端验证通过**，项目目标「对接飞书的 CRM」已从代码就绪变为真实可用。

## 验证明细

### 1. 消息发送 / 消息卡片 ✅

- 调用 `client.im.v1.message.create` 发送交互式卡片到负责人 open_id。
- 结果：`code:0 / success`，messageId `om_x100b7f3cf6dce4a0c0a933139b1476d`。
- 对应业务：客户/商机创建后，`notifyUser()` 自动给负责人发卡片（`customer_created` / `opportunity_created`）。

### 2. 事件订阅（长连接）✅

- 运行 `npm run feishu:events`，SDK 报 `[ws] ws client ready`，长连接建立成功。
- 在飞书给机器人发送消息后，日志收到：
  ```
  [feishu:event] 收到消息 messageId=om_x100b7f3c8ef85ca0ddb046064f8f35f
  chatId=oc_12b77bb03c4d350f204e4fc99a291dfa type=text from=CRM用户:nickxiao
  ```
- 证明：事件通过长连接推送 → 分发器解析 → 发送者 open_id 成功匹配 CRM 用户（身份联动）。

### 3. 通讯录同步 ✅

- 运行 `npm run feishu:sync-contacts`。
- 结果：人员 1 个同步入 Postgres（用户 `nickxiao`，open_id `ou_386fe9ba5db162123bc0d97b592e80bc`），幂等可重复运行。
- 部门数 0：应用未被授予部门可见范围，脚本自动降级为拉取全部用户（数据不丢）。

## 前置条件（均已完成）

- [x] 权限 scope 批量导入（`docs/feishu/scopes.json`）
- [x] 机器人能力（实测消息发送 `code:0`）
- [x] 事件订阅：`im.message.receive_v1` + 长连接模式
- [x] 发布版本（权限与事件在生产环境生效）
- [x] 凭证写入 `.env.local`

## 运行入口

```bash
npm run feishu:events          # 启动事件长连接（需保持运行）
npm run feishu:sync-contacts   # 手动同步通讯录
# Web：设置页 → 立即同步通讯录
```

## 待续（可选）

- 若需要部门数据：在飞书后台通讯录权限的「可访问范围」设为全员，再同步。
- 若部署 Vercel：补 `src/app/api/cron/sync-contacts/route.ts`（带 CRON_SECRET 校验）。
- OAuth 用户授权（飞书登录）尚未接入，当前用 open_id 匹配已满足通知与事件联动。
