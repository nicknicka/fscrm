import * as lark from "@larksuiteoapi/node-sdk";
import { getFeishuClient, isFeishuConfigured } from "../client";
import { createEventDispatcher } from "./dispatcher";
import { handleMessageReceive } from "./handlers/message";
import type { FeishuEventRegistry } from "./dispatcher";

/**
 * 飞书事件订阅（长连接）生命周期管理。
 *
 * 采用 SDK 长连接（WebSocket）方式订阅事件：本地开发、中小规模应用无需
 * 公网域名 / HTTPS，飞书通过连接主动推送事件。SDK 内置自动重连。
 */

/** 默认事件处理器注册表。 */
const defaultRegistry: FeishuEventRegistry = {
  "im.message.receive_v1": handleMessageReceive,
};

/**
 * 创建并启动飞书事件长连接。
 *
 * @param registry 自定义事件处理器注册表；未传时使用默认注册表
 * @returns 已启动的 `WSClient`，可调用 `stop()` 关闭
 * @throws 凭证未配置时抛出错误
 */
export function startFeishuEvents(
  registry: FeishuEventRegistry = defaultRegistry
): lark.WSClient {
  if (!isFeishuConfigured()) {
    throw new Error(
      "飞书凭证未配置：无法启动事件长连接。请设置 FEISHU_APP_ID 与 FEISHU_APP_SECRET。"
    );
  }

  const client = getFeishuClient();
  const appId = client.appId;
  const appSecret = client.appSecret;

  const wsClient = new lark.WSClient({
    appId,
    appSecret,
    domain: lark.Domain.Feishu,
    loggerLevel: lark.LoggerLevel.info,
    autoReconnect: true,
  });

  const dispatcher = createEventDispatcher(registry);

  wsClient.start({ eventDispatcher: dispatcher }).catch((error: unknown) => {
    console.error("[feishu:event] 启动事件长连接失败", error);
  });

  return wsClient;
}
