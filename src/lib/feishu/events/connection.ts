import * as lark from "@larksuiteoapi/node-sdk";
import { getFeishuClient, isFeishuConfigured } from "../client";
import { createEventDispatcher } from "./dispatcher";
import { handleMessageReceive } from "./handlers/message";
import { handleCardActionEvent } from "./handlers/card-action";
import type { FeishuEventRegistry } from "./dispatcher";

/**
 * 飞书事件订阅（长连接）生命周期管理。
 *
 * 采用 SDK 长连接（WebSocket）方式订阅事件：本地开发、中小规模应用无需
 * 公网域名 / HTTPS，飞书通过连接主动推送事件。SDK 内置自动重连。
 *
 * 同时注册两类能力：
 * - 事件：`im.message.receive_v1`（收到 @ 机器人的消息）；
 * - 回调：`card.action.trigger`（卡片按钮点击），需要卡片配置
 *   `"behaviors": [{"type": "callback"}]` 才会走这里。
 */

/** 默认事件处理器注册表。 */
const defaultRegistry: FeishuEventRegistry = {
  "im.message.receive_v1": handleMessageReceive,
  "card.action.trigger": handleCardActionEvent,
};

/** 已启动的长连接句柄。 */
export interface RunningFeishuEvents {
  /** 关闭长连接。 */
  stop(): Promise<void>;
}

/**
 * 创建并启动飞书事件长连接。
 *
 * @param registry 自定义事件处理器注册表；未传时使用默认注册表
 * @throws 凭证未配置时抛出错误
 */
export async function startFeishuEvents(
  registry: FeishuEventRegistry = defaultRegistry
): Promise<RunningFeishuEvents> {
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

  // SDK 的 start() 不返回可 await 的握手结果，这里包一层拿到 ready 时机，
  // 让命令行启动脚本能明确打印「已连上」而不是「已开始尝试」。
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("长连接握手超时（15 秒）")),
      15_000
    );
    wsClient
      .start({ eventDispatcher: dispatcher })
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });

  console.log("[feishu:event] 长连接已就绪，等待事件推送");

  return {
    async stop() {
      try {
        wsClient.close({ force: true });
      } catch (error) {
        console.error("[feishu:event] 关闭长连接失败", error);
      }
    },
  };
}
