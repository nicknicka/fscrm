import { describe, expect, it, vi } from "vitest";
import { extractMessage, handleMessageReceive } from "./message";
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

describe("extractMessage", () => {
  it("从消息事件提取结构化字段", () => {
    const parsed = extractMessage(makeEvent());
    expect(parsed.messageId).toBe("om_123");
    expect(parsed.chatId).toBe("oc_chat");
    expect(parsed.chatType).toBe("p2p");
    expect(parsed.messageType).toBe("text");
    expect(parsed.senderOpenId).toBe("ou_sender");
    expect(parsed.content).toEqual({ text: "你好" });
  });

  it("内容非 JSON 时保留原始字符串", () => {
    const parsed = extractMessage(
      makeEvent({
        message: {
          message_id: "om_2",
          chat_id: "oc_chat",
          chat_type: "p2p",
          message_type: "text",
          content: "不是 JSON 的原始内容",
          create_time: "1700000000000",
        },
      })
    );
    expect(parsed.content).toBe("不是 JSON 的原始内容");
  });

  it("无发送者时 senderOpenId 为 null", () => {
    const parsed = extractMessage(makeEvent({ sender: undefined }));
    expect(parsed.senderOpenId).toBeNull();
  });
});

describe("handleMessageReceive", () => {
  it("收到消息事件时记录结构化日志且不抛错", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() =>
      handleMessageReceive({ key: "im.message.receive_v1", data: makeEvent() })
    ).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
