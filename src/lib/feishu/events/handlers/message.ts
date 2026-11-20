import { getUserByFeishuOpenId } from "@/lib/db/repositories/user";
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
 * 收到消息后：
 * 1. 提取结构化消息内容；
 * 2. 按发送者飞书 open_id 匹配 CRM 用户（身份联动）；
 * 3. 记录结构化日志。
 *
 * 注：当前不自动创建跟进记录——消息可能没有明确的客户上下文，
 * 强行写入会污染跟进数据。识别出的 CRM 用户可用于后续交互（如回复确认、指令处理）。
 */
export const handleMessageReceive: FeishuEventHandler = async ({ data }) => {
  const message = extractMessage(asMessageReceiveEvent(data));

  // 按 open_id 匹配 CRM 用户，失败不影响事件处理
  let crmUser: { id: string; name: string } | null = null;
  if (message.senderOpenId) {
    try {
      const user = await getUserByFeishuOpenId(message.senderOpenId);
      if (user) {
        crmUser = { id: user.id, name: user.name };
      }
    } catch (error) {
      console.warn("[feishu:event] 匹配 CRM 用户失败（已忽略）:", error);
    }
  }

  console.log(
    `[feishu:event] 收到消息 messageId=${message.messageId} ` +
      `chatId=${message.chatId} type=${message.messageType} ` +
      `from=${crmUser ? `CRM用户:${crmUser.name}` : (message.senderOpenId ?? "未知")}`
  );
};
