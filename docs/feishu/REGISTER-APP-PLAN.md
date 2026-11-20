# `registerApp` 自动配置预演（只读，未执行）

本文件记录对飞书 SDK `registerApp` 能力的**只读预演**，未调用任何写操作、未改动现有应用配置。

## 目标

评估能否用 `registerApp` 的 `addons` 自动配置 fscrm 应用的**权限 scope** 与**事件订阅**，替代此前在飞书后台的手动操作。

## 依据（SDK 类型定义，来自 `@larksuiteoapi/node-sdk`）

`registerApp(options: RegisterAppOptions)` 的关键参数：

```ts
interface RegisterAppOptions {
  appId?: string; // 传入已有应用 ID 时走「更新配置」流程
  createOnly?: boolean; // true 时强制创建新应用，忽略 appId
  addons?: {
    preset?: boolean; // 是否使用官方「智能体应用配置清单」预置
    scopes?: { tenant?: string[]; user?: string[] }; // 自定义权限
    events?: { items?: { tenant?: string[]; user?: string[] } }; // 自定义事件订阅
    callbacks?: { items?: string[] };
  };
  appPreset?: { avatar?; name?; desc? };
  onQRCodeReady: (info) => void; // 回调里给出扫码链接
  onStatusChange?: (info) => void;
}
```

返回 `RegisterAppResult`：`client_id`（App ID）、`client_secret`（App Secret）、`user_info`。

## 预演结论

### 能自动做的

- ✅ **权限 scope**：`addons.scopes.tenant` 传入 `docs/feishu/scopes.json` 的 8 个 scope，走更新流程即可追加。
- ✅ **事件订阅**：`addons.events.items.tenant` 可传 `im.message.receive_v1`，自动订阅。
- ✅ **更新已有应用**：传 `appId: 'cli_aa75a1d995f8dd24'` 会更新现有应用，确认页展示 diff，用户扫码确认后生效。

### 不能自动做的

- ❌ **机器人能力**（应用能力）：`addons` 无对应字段，仍需在后台「应用能力 → 添加机器人」手动加。
- ❌ **版本发布**：`registerApp` 不发布版本，仍需后台「版本管理与发布 → 创建版本 → 发布」。
- ⚠️ **必须扫码**：`onQRCodeReady` 给出一个十分钟内有效、仅一位用户可用的链接，需你本人用飞书扫码确认。

### 风险提示

- 走更新流程后 `client_secret` 可能**重新生成**——若轮换，需同步更新 `.env.local`。
- `addons.preset: true` 会引入官方「智能体配置清单」里**额外的权限与事件**（远超 fscrm 所需），建议用 `preset: false` + 精确 `scopes`/`events`，最小化权限面。

## 建议路径

若决定走这条路，最小改动方案：

```ts
lark.registerApp({
  appId: "cli_aa75a1d995f8dd24",
  addons: {
    preset: false,
    scopes: { tenant: [/* scopes.json 的 8 项 */] },
    events: { items: { tenant: ["im.message.receive_v1"] } },
  },
  onQRCodeReady: (info) => console.log("请扫码:", info.url),
});
```

扫码确认后：权限与事件订阅自动生效（可能仍需发布版本才在生产生效）；机器人能力与版本发布仍需手动。

## 状态

**未执行**。等待用户确认是否要走这条需扫码、可能影响凭证的路径。
