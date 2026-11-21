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

## 真机 E2E 复核清单（#27）

本文件上方的“验证明细”记录的是 **2026-11-21 的一次既往运行**，不是当前分支在登录/权限变更后的重新验证。工单 #27 的可勾选复核清单与时间/环境/结果/错误码记录模板见 [`docs/feishu/E2E-CHECKLIST.md`](./E2E-CHECKLIST.md)。

该清单覆盖四条链路：飞书 OAuth 登录进入 CRM、客户/商机创建后收到消息卡片、长连接事件与 CRM 负责人匹配、通讯录同步用户落库。模板中的四项状态均为 **待执行 / 待确认**；只有人工操作员使用真实飞书账号和真实环境执行后，才能更新为“通过 / 未通过 / 受阻”。本工单没有重新执行真实飞书 E2E，没有读取或轮换凭证。

## App Secret 轮换清单（#28）

轮换 Runbook（飞书后台生成新 Secret → 更新本地环境变量 → 重启相关进程 → 重跑下方四项真机验证 → 记录结果 → 验证通过后撤销旧 Secret）、旧凭证作废时机、回滚步骤与交接/状态模板见 [`docs/feishu/SECRET-ROTATION.md`](./SECRET-ROTATION.md)。该清单初始状态为 **待执行 / 待确认**；编写会话没有生成、读取或轮换任何凭证，也没有执行任何真机验证。

## 权限与登录回归（#18 文档收口）

> 本节的回归结论来自仓库内已有自动化测试，不是本次会话重新执行的真实飞书端到端验证。

本次会话没有重新执行真实飞书 E2E：没有重新登录飞书用户、没有重新触发生产消息卡片投递、没有重新建立长连接或运行通讯录同步。下面结论只覆盖自动化单元/集成测试；涉及 Prisma 的测试使用 mock 客户端，不连接真实 Postgres。

### 已由自动化测试覆盖的范围

- 普通负责人与管理员的边界由以下测试文件覆盖，共 **39** 个用例：
  - `src/lib/db/repositories/customer.scope.test.ts`（8 个）
  - `src/lib/db/repositories/sales.lead.test.ts`（4 个）
  - `src/lib/db/repositories/opportunity-scope.test.ts`（10 个）
  - `src/lib/db/repositories/sales.followup.test.ts`（17 个）
- 页面/Server Action 在进入仓储前使用会话范围、拒绝未登录和越权动作，由以下测试文件覆盖，共 **13** 个用例：
  - `src/app/(dashboard)/customers/actions.test.ts`（4 个）
  - `src/app/(dashboard)/leads/actions.test.ts`（4 个）
  - `src/app/(dashboard)/opportunities/actions.test.ts`（5 个）
- 飞书登录、回调、会话、页面入口由以下测试文件覆盖，共 **31** 个用例：
  - `src/app/api/auth/feishu/login/route.test.ts`（4 个）
  - `src/app/api/auth/feishu/callback/route.test.ts`（13 个）
  - `src/lib/auth/session.test.ts`（8 个）
  - `src/app/login/page.test.ts`（8 个，含参数化用例展开）
  - `src/app/auth/actions.test.ts`（1 个）
  - `src/app/auth/login-reentry.test.ts`（1 个）
  - `src/app/(dashboard)/layout.test.ts`（2 个）
- 已有飞书能力的纯代码行为由以下测试文件覆盖，共 **25** 个用例：
  - `src/lib/feishu/message/notification.test.ts`（5 个）
  - `src/lib/feishu/message/notification.route.test.ts`（2 个）
  - `src/lib/feishu/events/dispatcher.test.ts`（3 个）
  - `src/lib/feishu/events/handlers/message.test.ts`（4 个）
  - `src/lib/feishu/contact/mapping.test.ts`（5 个）
  - `src/lib/feishu/contact/sync.test.ts`（3 个）
  - `src/lib/feishu/client.test.ts`（3 个）
- 另有 `src/lib/db/client.test.ts` 1 个数据库连通性用例，当前因未配置 `DATABASE_URL` 而 skipped。
- `npm test` 本次结果：**128 passed、1 skipped**；跳过项是 `src/lib/db/client.test.ts`，它需要真实数据库连接，本会话未运行真实数据库测试。
- 仓库共声明 **129** 个测试用例（其中 1 个 skipped）；#18 本身只改文档，没有改动 `src/**`，没有修改消息卡片、长连接事件或通讯录同步代码路径。客户/商机创建后通知实际负责人的自动化断言见 `customers/actions.test.ts` 与 `opportunities/actions.test.ts`；卡片模板和发送适配器的断言见 `notification.test.ts` 与 `notification.route.test.ts`。

### 仍需人工/真实环境确认

- 飞书后台登记的生产重定向 URL 与 `.env.local` 中的 `FEISHU_OAUTH_REDIRECT_URI` 完全一致，且 user scope 已开通并发布。
- 真实飞书用户登录、客户/商机创建后真实收到卡片、长连接在线并收到测试消息、通讯录同步写库，均未在本次会话重跑；如需上线确认，请按 `docs/feishu/README.md`、`docs/feishu/RUNTIME.md`、`docs/feishu/SETUP-FINAL.md` 的清单另行执行。

### Secret 轮换建议（仅建议，未执行）

- 本票**未轮换**任何飞书应用凭证或会话密钥，也未修改 `.env.local`，仓库内无真实凭证。
- 建议由运维在后续独立变更中轮换飞书 App Secret，并同步更新运行环境的密钥；`SESSION_SECRET` 也建议按环境独立生成，避免复用或长期共用。轮换窗口按部署流程安排，本次不执行。

## 待续（可选）

- 若需要部门数据：在飞书后台通讯录权限的「可访问范围」设为全员，再同步。
- 若部署 Vercel / 云端：按 [`SCHEDULE.md`](./SCHEDULE.md) 配置 `CRON_SECRET` 与定时任务，调用 `POST /api/cron/sync-contacts`（`Authorization: Bearer <CRON_SECRET>`）。
- OAuth 用户授权（飞书登录）已由自动化测试覆盖；真实飞书登录未在本次会话重跑，详见上文「权限与登录回归」。
