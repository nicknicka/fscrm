import { afterEach, describe, expect, it, vi } from "vitest";

const { scanReminders, sendCard } = vi.hoisted(() => ({
  scanReminders: vi.fn(),
  sendCard: vi.fn(),
}));

vi.mock("./scan", () => ({
  scanReminders,
  REMINDER_DEFAULTS: { maxItemsPerCard: 5 },
}));

vi.mock("@/lib/feishu/bot/sender", () => ({ sendCard }));

import { dispatchReminders, dispatchRemindersForOwner } from "./dispatch";

const batch = {
  ownerId: "u1",
  ownerName: "张三",
  ownerOpenId: "ou_1",
  kind: "customer_silent" as const,
  items: [{ id: "c1", title: "云启科技", detail: "20 天没有跟进了" }],
  total: 1,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("dispatchReminders", () => {
  it("给每个绑定飞书的负责人推一张卡片", async () => {
    scanReminders.mockResolvedValue({
      batches: [batch],
      skippedUnbound: 0,
      scannedAt: new Date(),
    });
    sendCard.mockResolvedValue({ ok: true, messageId: "om_1" });

    const result = await dispatchReminders();
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(sendCard).toHaveBeenCalledWith("ou_1", expect.any(Object));
  });

  it("未绑定飞书的负责人被跳过，不影响其他人", async () => {
    scanReminders.mockResolvedValue({
      batches: [
        batch,
        { ...batch, ownerId: "u2", ownerName: "李四", ownerOpenId: null },
      ],
      skippedUnbound: 1,
      scannedAt: new Date(),
    });
    sendCard.mockResolvedValue({ ok: true });

    const result = await dispatchReminders();
    expect(result.sent).toBe(1);
    expect(result.skippedUnbound).toBe(1);
    expect(sendCard).toHaveBeenCalledTimes(1);
  });

  it("单张发送失败只计数，不中断整批", async () => {
    scanReminders.mockResolvedValue({
      batches: [batch, { ...batch, ownerId: "u2", ownerOpenId: "ou_2" }],
      skippedUnbound: 0,
      scannedAt: new Date(),
    });
    sendCard
      .mockResolvedValueOnce({ ok: false, error: "boom" })
      .mockResolvedValueOnce({ ok: true });

    const result = await dispatchReminders();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
  });

  it("类别不同的提醒同一负责人会收到多张卡（处理方式不同）", async () => {
    scanReminders.mockResolvedValue({
      batches: [batch, { ...batch, kind: "payment_due" as const, items: [] }],
      skippedUnbound: 0,
      scannedAt: new Date(),
    });
    sendCard.mockResolvedValue({ ok: true });

    const result = await dispatchReminders();
    expect(result.sent).toBe(2);
  });
});

describe("dispatchRemindersForOwner", () => {
  it("只推给指定负责人", async () => {
    scanReminders.mockResolvedValue({
      batches: [
        batch,
        { ...batch, ownerId: "u2", ownerName: "李四", ownerOpenId: "ou_2" },
      ],
      skippedUnbound: 0,
      scannedAt: new Date(),
    });
    sendCard.mockResolvedValue({ ok: true });

    const result = await dispatchRemindersForOwner("u2");
    expect(result.sent).toBe(1);
    expect(sendCard).toHaveBeenCalledWith("ou_2", expect.any(Object));
  });
});
