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

### user（用户身份权限，OAuth 场景）

飞书登录使用用户身份（OAuth）权限，与上面的 `tenant`（应用身份）权限分开配置：tenant 权限供消息卡片、事件长连接与通讯录同步使用；user 权限供登录授权码换取用户身份使用。二者即使 scope 名称相同，也不能互相替代。

当前用户身份网关只需登录回调能取得用户 open_id；代码按 `open_id` 匹配 CRM 用户的 `feishuOpenId` 字段。实际要在开放平台开通的 user scope，请以 [scopes.json](./scopes.json) 的 `user` 数组为准，并在 `.env.local` 的 `FEISHU_OAUTH_SCOPE` 中以空格分隔填写同一组值。

> 旧记录曾把 `user` 数组留空、并称 OAuth 尚未接入；飞书登录已由 #11–#13 等代码工单接入，本文件为文档收口更新。若后台尚未开通任何 user scope，需要先开通并在环境模板中登记，否则登录会因授权失败返回错误页。

## 飞书登录（OAuth）配置

### 1. 开放平台后台

1. 左侧 **开发配置 → 安全设置 → 重定向 URL**，添加**与运行地址完全一致**的回调地址：
   - 本地：`http://localhost:3000/api/auth/feishu/callback`
   - 生产：`https://<你的域名>/api/auth/feishu/callback`
   - 路径固定为 `/api/auth/feishu/callback`；不要沿用旧文档里的 `/api/auth/callback`。
2. 左侧 **开发配置 → 权限管理**，开通 `scopes.json` 中 `user` 数组对应的用户身份 scope；这些是 OAuth 用户身份权限，不要拿 tenant 权限批量导入结果代替。
3. 创建并发布应用版本，使重定向 URL 与 user scope 生效。

### 2. 环境变量（只写 `.env.local`，切勿提交真实值）

| 变量 | 用途与要求 |
| --- | --- |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 飞书应用凭证；先从 `.env.example` 占位复制，真实值只放入 gitignore 的 `.env.local`。 |
| `FEISHU_APP_DOMAIN` | 授权页域名；飞书为 `https://open.feishu.cn`，Lark 为 `https://open.larksuite.com`。 |
| `FEISHU_OAUTH_REDIRECT_URI` | 应用发起授权时传给飞书的 `redirect_uri`，必须与后台登记的重定向 URL **逐字一致**。本地示例：`http://localhost:3000/api/auth/feishu/callback`。 |
| `FEISHU_OAUTH_SCOPE` | 授权请求携带的 user scope，空格分隔；需与后台已开通的用户身份 scope 对齐，例如 `contact:user.id:readonly`。不要填 tenant scope。 |
| `SESSION_SECRET` | 服务端会话签名密钥，至少 32 字符的独立随机值；可用 `openssl rand -base64 32` 生成。是敏感配置，真实值只写入 `.env.local`，不得复用飞书应用凭证。 |

仓库里的 [.env.example](../../.env.example) 只提供键名与占位/示例，不含任何真实密钥。真实值只写入 `.env.local`。

批量导入只能配置权限 scope，以下配置需在开放平台页面手动完成：

1. **事件订阅**：左侧「事件订阅」→ 订阅方式选「使用长连接接收事件」→ 添加事件 `im.message.receive_v1`（接收消息）。
2. **机器人能力**：左侧「应用能力」→ 添加「机器人」能力（发送消息与事件接收的前提）。
3. **OAuth 重定向 URL**：左侧「开发配置 → 安全设置 → 重定向 URL」登记 `http://localhost:3000/api/auth/feishu/callback`（开发）以及生产域名下的 `/api/auth/feishu/callback`（生产）。同时开通用户身份 scope 并配置 `FEISHU_OAUTH_REDIRECT_URI` / `FEISHU_OAUTH_SCOPE`；细节见上文「飞书登录（OAuth）配置」。

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
