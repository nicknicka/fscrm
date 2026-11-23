import { describe, expect, it, vi } from "vitest";

// 隔离业务依赖：底层会查库、发卡片，这里只验证「事件 → 机器人输入」的翻译。
vi.mock("@/lib/feishu/bot/message-flow", () => ({
  handleInboundMessage: vi.fn(async () => ({
    status: "handled",
    summary: "followUp(model) → 云启科技",
  })),
}));

import { extractMessage, extractText, handleMessageReceive } from "./message";
import { handleInboundMessage } from "@/lib/feishu/bot/message-flow";
import type { FeishuMessageReceiveEvent } from "../types";

function makeEvent(
  overrides: Partial<FeishuMessageReceiveEvent> = {}
): FeishuMessageReceiveEvent {
  return {
    event_id: "evt_1",
    sender: { sender_id: { open_id: "ou_sender" }, sender_type: "user" },
    message: {
      message_id: "om_123",
      chat_id: "oc_chat",
      chat_type: "p2p",
      message_type: "text",
      content: JSON.stringify({ text: "你好" }),
      create_time: "1700000000000",
    },
    ...overrides,
  };
}

describe("extractText", () => {
  it("去掉 @提及占位符并压缩空白", () => {
    const text = extractText(
      { text: "@_user_1 记一下  客户云启科技今天电话聊了" },
      [{ key: "@_user_1", name: "CRM 助手" }]
    );
    expect(text).toBe("记一下 客户云启科技今天电话聊了");
  });

  it("多个提及全部去掉", () => {
    const text = extractText({ text: "@_user_1 @_user_2 明天下午拜访" }, [
      { key: "@_user_1", name: "a" },
      { key: "@_user_2", name: "b" },
    ]);
    expect(text).toBe("明天下午拜访");
  });
});

describe("extractMessage", () => {
  it("从消息事件提取结构化字段", () => {
    const parsed = extractMessage(makeEvent());
    expect(parsed.messageId).toBe("om_123");
    expect(parsed.chatId).toBe("oc_chat");
    expect(parsed.chatType).toBe("p2p");
    expect(parsed.messageType).toBe("text");
    expect(parsed.senderOpenId).toBe("ou_sender");
    expect(parsed.text).toBe("你好");
    // 单聊且无 mentions：不是 @机器人，由上层按 chatType 放行
    expect(parsed.mentionedBot).toBe(false);
  });

  it("有 @提及 时标记为提及了机器人", () => {
    const parsed = extractMessage(
      makeEvent({
        message: {
          message_id: "om_2",
          chat_id: "oc_chat",
          chat_type: "group",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 客户云启科技电话聊了" }),
          create_time: "1700000000000",
          mentions: [
            { key: "@_user_1", name: "CRM 助手", id: { open_id: "ou_bot" } },
          ],
        },
      })
    );
    expect(parsed.mentionedBot).toBe(true);
    expect(parsed.text).toBe("客户云启科技电话聊了");
  });

  it("内容非 JSON 时保留原文", () => {
    const parsed = extractMessage(
      makeEvent({
        message: {
          message_id: "om_3",
          chat_id: "oc_chat",
          chat_type: "p2p",
          message_type: "text",
          content: "不是 JSON 的原始内容",
          create_time: "1700000000000",
        },
      })
    );
    expect(parsed.text).toBe("不是 JSON 的原始内容");
  });

  it("无发送者时 senderOpenId 为 null", () => {
    const parsed = extractMessage(makeEvent({ sender: undefined }));
    expect(parsed.senderOpenId).toBeNull();
  });
});

describe("handleMessageReceive", () => {
  it("文本消息交给机器人主流程", async () => {
    await handleMessageReceive({
      key: "im.message.receive_v1",
      data: makeEvent(),
    });
    expect(handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "om_123",
        senderOpenId: "ou_sender",
        text: "你好",
      })
    );
  });

  it("非文本消息直接忽略，不进主流程", async () => {
    vi.mocked(handleInboundMessage).mockClear();
    await handleMessageReceive({
      key: "im.message.receive_v1",
      data: makeEvent({
        message: {
          message_id: "om_img",
          chat_id: "oc_chat",
          chat_type: "p2p",
          message_type: "image",
          content: JSON.stringify({ image_key: "img_1" }),
          create_time: "1700000000000",
        },
      }),
    });
    expect(handleInboundMessage).not.toHaveBeenCalled();
  });

  it("缺少发送者时忽略", async () => {
    vi.mocked(handleInboundMessage).mockClear();
    await handleMessageReceive({
      key: "im.message.receive_v1",
      data: makeEvent({ sender: undefined }),
    });
    expect(handleInboundMessage).not.toHaveBeenCalled();
  });
});
