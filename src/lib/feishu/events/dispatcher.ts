import * as lark from "@larksuiteoapi/node-sdk";
import type { FeishuEventHandler, FeishuEventPayload } from "./types";

/** 事件处理器注册表：事件键 -> 处理器。 */
export type FeishuEventRegistry = Record<string, FeishuEventHandler>;

/** 日志接口，默认输出到 console。 */
export interface FeishuEventLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

const defaultLogger: FeishuEventLogger = {
  info: (message) => console.log(`[feishu:event] ${message}`),
  error: (message, error) =>
    console.error(`[feishu:event] ${message}`, error ?? ""),
};

/**
 * 根据处理器注册表创建 SDK 的 `EventDispatcher`。
 *
 * 每个事件处理器会被错误兜底：飞书要求事件在 3 秒内处理完毕，
 * 单个事件处理抛出异常时记录日志，避免中断整个长连接。
 *
 * @param registry 事件处理器注册表
 * @param logger 日志接口，默认输出到 console
 */
export function createEventDispatcher(
  registry: FeishuEventRegistry,
  logger: FeishuEventLogger = defaultLogger
): lark.EventDispatcher {
  const dispatcher = new lark.EventDispatcher({});

  const handles: Record<string, (data: unknown) => void | Promise<void>> = {};

  for (const [key, handler] of Object.entries(registry)) {
    handles[key] = (data: unknown) => {
      const payload: FeishuEventPayload = { key, data };
      return Promise.resolve()
        .then(() => handler(payload))
        .catch((error: unknown) => {
          logger.error(`处理事件失败：${key}`, error);
        });
    };
  }

  dispatcher.register(handles);
  return dispatcher;
}
