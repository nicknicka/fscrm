# ADR-0002：飞书应用接入现状与所需权限

- **状态**：已接受
- **日期**：2026-11-21
- **决策者**：nicknicka

## 背景

项目目标是对接飞书开放平台。用户提供了一套飞书自建应用凭证（`cli_aa75a1d995f8dd24`），存于本地 `.env.local`（已 gitignore，不入库）。为推进飞书能力与业务的接线，需要确认凭证有效性与应用已开通的权限范围。

## 决策

凭证经真实 API 验证**有效**：`client.auth.tenantAccessToken.internal` 返回 `code:0 / ok`，可正常换取应用身份令牌。

当前应用**尚未开通通讯录权限**：调用 `client.contact.department.list` 返回错误码 `99991672`，提示需要以下任一应用身份权限：

- `contact:contact.base:readonly`
- `contact:department.organize:readonly`
- `contact:contact:access_as_app`
- `contact:contact:readonly`
- `contact:contact:readonly_as_app`

开通入口（错误响应给出）：
`https://open.feishu.cn/app/cli_aa75a1d995f8dd24/auth?q=contact:contact.base:readonly,...&op_from=openapi&token_type=tenant`

结论：**代码侧无需改动；飞书业务能力（通讯录同步等）在权限开通前无法端到端验证。**

## 影响

- `.env.local` 中的 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 已填写真实值；因该文件已忽略，不会泄露到公开仓库。
- 凭证曾出现在会话记录中，建议后续在飞书开放平台**轮换一次 Secret**，并用新值更新 `.env.local`。
- 权限开通属于飞书开放平台后台操作，非仓库代码变更；本 ADR 记录所需 scope 清单，便于逐项开通。

## 权限验证结果（2026-11-21 实测）

批量导入权限后已重跑真实 API 验证：

| 业务能力                | 所需权限（应用身份）                                                         | 验证结果                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 通讯录同步（部门/用户） | `contact:contact.base:readonly` 或 `contact:department.organize:readonly` 等 | ✅ 已通：`contact.user.list` 返回 `code:0`，读取到 1 个用户                                                                  |
| 发送消息 / 消息卡片     | `im:message`（或 `im:message:send_as_bot` 等）                               | ⚠️ 权限已通（不再报 `99991672`），但需先在开放平台**添加机器人能力并发布版本**，否则报 `230006 Bot ability is not activated` |
| 事件订阅（长连接）      | 需在开放平台订阅对应事件（如 `im.message.receive_v1`）                       | 待配置并验证                                                                                                                 |
| 用户身份授权（OAuth）   | 需在开放平台配置重定向 URL 与 `contact:user.*` 用户身份 scope                | 待配置并验证                                                                                                                 |

实测读取到的用户信息：`name=nickxiao`，`open_id=ou_386fe9ba5db162123bc0d97b592e80bc`（仅用于验证，不入库）。

## 替代方案

无。应用身份权限必须在飞书开放平台后台开通，无法通过代码绕过。
