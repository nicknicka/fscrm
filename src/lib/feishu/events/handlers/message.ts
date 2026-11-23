import type { FeishuEventHandler } from "../types";
import { handleInboundMessage } from "../../bot/message-flow";

/**
 * `im.message.receive_v1`（收到消息）处理器。
 *
 * 只做「把飞书事件翻译成机器人输入」这件事，业务逻辑全在
 * `bot/message-flow.ts`：那里才有去重、身份映射、模型解析、落库与回复。
 * 这样消息处理器可以被命令行脚本直接复用，也便于单测。
 */

/** 从事件里取出的最小消息信息。 */
export interface ParsedMessage {
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  senderOpenId: string | null;
  /** 原文（已去掉 @提及 占位符）。 */
  text: string;
  /** 是否 @了机器人。 */
  mentionedBot: boolean;
}

interface RawMention {
  key?: string;
  name?: string;
  id?: { open_id?: string };
}

interface RawEventData {
  sender?: { sender_id?: { open_id?: string } };
  message?: {
    message_id?: string;
    chat_id?: string;
    chat_type?: string;
    message_type?: string;
    content?: string;
    mentions?: RawMention[];
  };
}

/**
 * 解析消息正文。
 *
 * 飞书文本消息的 content 形如 `{"text":"@_user_1 记一下..."}`；
 * @提及 在正文里是 `@_user_N` 占位符，需要按 mentions 列表逐个替换掉，
 * 否则模型会把 `@_user_1` 当成公司名的一部分。
 */
export function extractText(
  content: unknown,
  mentions: RawMention[] = []
): string {
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (content && typeof content === "object") {
    const value = (content as { text?: unknown }).text;
    if (typeof value === "string") text = value;
  }
  for (const mention of mentions) {
    if (mention.key) {
      text = text.split(mention.key).join("");
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

/** 从消息事件提取结构化信息。 */
export function extractMessage(data: unknown): ParsedMessage {
  const event = (data ?? {}) as RawEventData;
  const message = event.message ?? {};
  const mentions = message.mentions ?? [];
  const rawContent = message.content ?? "";

  let parsedContent: unknown = rawContent;
  try {
    parsedContent = JSON.parse(rawContent);
  } catch {
    // 非 JSON 保留原文
  }

  // 注意：无法仅从事件判断机器人自身的 open_id，这里以「有无 @提及」近似判断。
  // 群聊里没有 @ 任何人时，SDK 侧也不会推送给我们；保守做法是要求 text 非空
  // 且存在 mentions，或单聊。
  const mentionedBot = mentions.length > 0;

  return {
    messageId: message.message_id ?? "",
    chatId: message.chat_id ?? "",
    chatType: message.chat_type ?? "p2p",
    messageType: message.message_type ?? "text",
    senderOpenId: event.sender?.sender_id?.open_id ?? null,
    text: extractText(parsedContent, mentions),
    mentionedBot,
  };
}

export const handleMessageReceive: FeishuEventHandler = async ({ data }) => {
  const message = extractMessage(data);

  if (!message.senderOpenId) {
    console.warn("[feishu:event] 消息缺少发送者 open_id，已忽略");
    return;
  }

  // 只处理文本消息；其他类型（图片、文件）暂时忽略，避免误把二进制当跟进内容
  if (message.messageType !== "text") {
    console.log(
      `[feishu:event] 忽略非文本消息 type=${message.messageType} id=${message.messageId}`
    );
    return;
  }

  const result = await handleInboundMessage({
    messageId: message.messageId,
    chatId: message.chatId,
    senderOpenId: message.senderOpenId,
    text: message.text,
    mentionedBot: message.mentionedBot,
    chatType: message.chatType,
  });

  console.log(
    `[feishu:event] message ${message.messageId} → ${result.status}` +
      ("summary" in result ? ` (${result.summary})` : "")
  );
};
