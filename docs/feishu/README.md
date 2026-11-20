# 飞书权限批量导入说明

本目录的 [scopes.json](./scopes.json) 是 fscrm 所需的**最小权限集**，已按飞书开放平台「批量导入/导出权限」的格式整理。

## 导入步骤

1. 打开飞书开放平台，进入应用 `cli_aa75a1d995f8dd24`：
   https://open.feishu.cn/app/cli_aa75a1d995f8dd24
2. 左侧导航：**开发配置 → 权限管理**。
3. 点击 **「批量导入/导出权限」** 按钮。
4. 切换到「导入」页签，把 [scopes.json](./scopes.json) 的**全部内容**粘贴进去（替换原有示例）。
5. 点击 **「下一步，确认新增权限」**。
6. 点击 **「申请开通」**，等待企业管理员审批（若你本人是管理员通常即时生效）。
7. 权限开通后，还需**发布应用版本**才在生产环境生效：左侧「版本管理与发布」→ 创建版本 → 发布。

## 权限清单与用途

### tenant（应用身份权限）

| 权限                                   | 用途                             | 来源         |
| -------------------------------------- | -------------------------------- | ------------ |
| `contact:contact.base:readonly`        | 读取用户基础信息（通讯录同步）   | API 报错要求 |
| `contact:department.organize:readonly` | 读取部门组织架构（通讯录同步）   | API 报错要求 |
| `contact:user.base:readonly`           | 读取用户基础字段                 | 官方文档示例 |
| `contact:user.id:readonly`             | 读取用户 open_id/user_id         | 官方文档示例 |
| `im:message`                           | 获取与发送单聊、群组消息         | API 报错要求 |
| `im:message:send_as_bot`               | 以机器人身份发送消息卡片         | 官方文档示例 |
| `im:message.p2p_msg:readonly`          | 接收单聊消息（事件订阅）         | 官方文档示例 |
| `im:message.group_at_msg:readonly`     | 接收群聊 @机器人消息（事件订阅） | 官方文档示例 |

> 注意：`im:message:send` 是**历史版本权限**（发送消息 V2），新版批量导入不接受该 scope，会报"格式错误"。
> 发消息能力已由 `im:message` 与 `im:message:send_as_bot` 覆盖，无需导入 `im:message:send`。
> 依据：https://open.larkoffice.com/document/server-docs/im-v1/message/reply?lang=zh-CN

### user（用户身份权限，OAuth 场景，当前留空）

当前项目主要使用应用身份权限，OAuth 用户授权尚未真正接入，因此 `user` 数组留空。
后续接入飞书登录时，再按需补充用户身份 scope（如 `contact:user.base:readonly` 的 user 版本）。

## 导入后还需配置（JSON 无法覆盖）

批量导入只能配置权限 scope，以下配置需在开放平台页面手动完成：

1. **事件订阅**：左侧「事件订阅」→ 订阅方式选「使用长连接接收事件」→ 添加事件 `im.message.receive_v1`（接收消息）。
2. **机器人能力**：左侧「应用能力」→ 添加「机器人」能力（发送消息与事件接收的前提）。
3. **OAuth 重定向 URL**（如需用户身份打通）：左侧「安全设置」→ 重定向 URL 添加 `http://localhost:3000/api/auth/callback`（开发环境）及生产域名回调地址。

## 验证方法

导入并发布后，告知我，我会用真实接口重跑以下验证：

- 通讯录：`contact.department.list` 是否返回 `code:0` 且有数据
- 消息：`im.message.create` 是否不再返回 `99991672`
- 事件：启动长连接后能否收到测试消息

## 参考

- 飞书开放平台批量导入权限的说明见多个官方集成文档，例如：
  https://www.feishu.cn/content/article/7613711414611463386
- 当前应用权限申请直达链接（通讯录）：
  https://open.feishu.cn/app/cli_aa75a1d995f8dd24/auth?q=contact:contact.base:readonly&op_from=openapi&token_type=tenant
