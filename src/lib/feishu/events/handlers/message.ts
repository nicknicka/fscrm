import type { FeishuEventHandler, FeishuMessageReceiveEvent } from "../types";

/** 从消息事件解析出的结构化消息信息。 */
export interface ParsedMessage {
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  senderOpenId: string | null;
  /** 已解析的消息内容；内容非 JSON 时保留原始字符串。 */
  content: unknown;
}

/**
 * 将事件数据收窄为消息接收事件。
 *
 * 分发边界上事件数据为 `unknown`，处理器在读取前按事件键做类型收窄。
 */
function asMessageReceiveEvent(data: unknown): FeishuMessageReceiveEvent {
  return data as FeishuMessageReceiveEvent;
}

/**
 * 安全解析飞书消息内容。
 *
 * 飞书消息的 `content` 是 JSON 字符串，不同消息类型结构不同。
 * 解析失败时返回原始字符串，避免因格式问题中断处理。
 */
function parseContent(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 从消息事件提取结构化信息。 */
export function extractMessage(
  event: FeishuMessageReceiveEvent
): ParsedMessage {
  const { message, sender } = event;
  return {
    messageId: message.message_id,
    chatId: message.chat_id,
    chatType: message.chat_type,
    messageType: message.message_type,
    senderOpenId: sender?.sender_id?.open_id ?? null,
    content: parseContent(message.content),
  };
}

/**
 * `im.message.receive_v1`（收到消息）事件处理器。
 *
 * 当前作为事件链路的验证入口：提取消息的结构化信息并记录。
 * 后续可在此处接入业务逻辑，如识别特定指令、创建跟进记录等。
 */
export const handleMessageReceive: FeishuEventHandler = ({ data }) => {
  const message = extractMessage(asMessageReceiveEvent(data));
  console.log(
    `[feishu:event] 收到消息 messageId=${message.messageId} ` +
      `chatId=${message.chatId} type=${message.messageType}`
  );
};
