import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FeishuCardMessage, FeishuTextMessage } from "./types";

// 用 vi.hoisted 定义 mock，确保 vi.mock 工厂执行时已初始化
const { sendCardMessageMock, sendTextMessageMock } = vi.hoisted(() => ({
  sendCardMessageMock: vi.fn(async (_arg: FeishuCardMessage) => ({
    code: 0,
    messageId: "om_1",
  })),
  sendTextMessageMock: vi.fn(async (_arg: FeishuTextMessage) => ({
    code: 0,
    messageId: "om_2",
  })),
}));

vi.mock("./sender", () => ({
  sendCardMessage: sendCardMessageMock,
  sendTextMessage: sendTextMessageMock,
}));

import { sendNotification } from "./notification";

describe("sendNotification", () => {
  beforeEach(() => {
    sendCardMessageMock.mockClear();
    sendTextMessageMock.mockClear();
  });

  it("跟进提醒场景发送卡片并填充变量", async () => {
    await sendNotification({
      scenario: "follow_up_reminder",
      receiveId: "ou_user",
      receiveIdType: "open_id",
      variables: { customerName: "Acme", opportunityName: "大单" },
    });

    expect(sendCardMessageMock).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).not.toHaveBeenCalled();

    const arg = sendCardMessageMock.mock.calls[0][0];
    expect(arg.receiveId).toBe("ou_user");
    expect(arg.title).toBe("跟进提醒");
    expect(arg.content).toContain("Acme");
    expect(arg.content).toContain("大单");
    expect(arg.content).not.toContain("{{customerName}}");
  });

  it("审批通知场景发送卡片", async () => {
    await sendNotification({
      scenario: "approval_notification",
      receiveId: "ou_user",
      receiveIdType: "open_id",
      variables: { approvalName: "合同审批" },
    });

    expect(sendCardMessageMock).toHaveBeenCalledTimes(1);
    const arg = sendCardMessageMock.mock.calls[0][0];
    expect(arg.title).toBe("审批通知");
    expect(arg.content).toContain("合同审批");
  });
});
