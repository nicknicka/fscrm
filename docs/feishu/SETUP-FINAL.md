# 飞书后台最终配置清单（选 A：手动配置）

> 更新时间：2026-11-21
> 应用：`cli_aa75a1d995f8dd24`（fscrm）

## 已完成（无需再做）

- [x] 批量导入权限 scope（通讯录 + 消息，`docs/feishu/scopes.json`）
- [x] 机器人能力 —— 实测 `im.message.create` 已返回 `code:0 / success`
- [x] 凭证已填入 `.env.local`

## 还需配置（2 步）

### 第 1 步：配置事件订阅

1. 打开应用后台：https://open.feishu.cn/app/cli_aa75a1d995f8dd24
2. 左侧导航：**开发配置 → 事件与回调**（有的版本叫「事件订阅」）
3. **订阅方式**：选择「**使用长连接接收事件 / Receive events through persistent connection**」
   - 注意：这个选项只有在客户端长连接在线时才能保存。先在本机运行 `npm run feishu:events`，保持终端不关，再去后台保存。
4. **添加事件**：点「添加事件」，搜索「接收消息」，勾选：
   - `im.message.receive_v1`（接收消息事件）
5. 保存。

> 为什么需要这一步：我们的 `npm run feishu:events` 长连接就是靠这个事件接收用户发给机器人的消息，然后按发送者 open_id 匹配 CRM 用户。

### 第 2 步：创建并发布版本

1. 左侧导航：**应用发布 → 版本管理与发布**（或顶部「创建版本」）
2. 点「**创建版本**」，填写：
   - 版本号：如 `1.0.0`
   - 更新说明：如「开通通讯录与消息权限，接入消息事件订阅」
3. 保存后提交发布。若你是企业管理员，通常即时生效；否则等管理员审批。
4. 发布后，第 1 步的事件订阅和此前导入的权限才在**生产环境**完全生效。

## 验证（配置完成后）

配置完成后，由人工操作员按 [`docs/feishu/E2E-CHECKLIST.md`](./E2E-CHECKLIST.md) 逐项执行并记录时间、环境、结果与错误码；不要使用本文件的说明代替真机结果：

1. **飞书 OAuth 登录**：打开 `/login` → 点击「使用飞书登录」→ 真实账号授权后进入 CRM 受保护页面。
2. **消息卡片**：在客户/商机页创建带负责人的记录 → 负责人飞书分别收到 `customer_created` / `opportunity_created` 卡片。
3. **事件订阅**：运行 `npm run feishu:events`，给机器人发一条消息 → 终端打印事件日志并显示匹配到的 CRM 用户。
4. **通讯录**：运行 `npm run feishu:sync-contacts`（或设置页点「立即同步通讯录」）→ `users` 表数据更新并写入 `feishuOpenId`。

清单模板中四项的初始状态均为 **待执行 / 待确认**；本文件不记录任何本次真机通过结论。

## 若遇到问题

- 事件订阅保存时报「无在线长连接」：先启动 `npm run feishu:events`，保持在线再保存。
- 发消息报 `230006 Bot ability is not activated`：机器人能力未加或未发布版本——但当前实测已通，正常不会再出现。
- 权限相关 `99991672`：权限未发布——完成第 2 步发布版本即可。
- 收不到消息事件：确认事件订阅已加 `im.message.receive_v1` 且版本已发布。

## 相关文件

- 权限 JSON：`docs/feishu/scopes.json`
- 运行时说明：`docs/feishu/RUNTIME.md`
- 定时任务：`docs/feishu/SCHEDULE.md`
- 能力预演：`docs/feishu/REGISTER-APP-PLAN.md`
