import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  auditWrite: vi.fn(),
  addPaymentPlan: vi.fn(),
  updatePaymentPlan: vi.fn(),
  deletePaymentPlan: vi.fn(),
  listPaymentPlans: vi.fn(),
  PaymentNotFoundError: class PaymentNotFoundError extends Error {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db/repositories/audit-log", () => ({
  auditWrite: mocks.auditWrite,
}));
vi.mock("@/lib/db/repositories/payment-plan", () => ({
  addPaymentPlan: mocks.addPaymentPlan,
  updatePaymentPlan: mocks.updatePaymentPlan,
  deletePaymentPlan: mocks.deletePaymentPlan,
  listPaymentPlans: mocks.listPaymentPlans,
  PaymentNotFoundError: mocks.PaymentNotFoundError,
}));

import {
  updatePaymentPlanForCurrentUser,
  updatePaymentPlanFormAction,
} from "./payment-plan-actions";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };

const form = (amount: string, plannedAt: string) => {
  const data = new FormData();
  data.set("amount", amount);
  data.set("plannedAt", plannedAt);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.updatePaymentPlan.mockResolvedValue({ id: "plan_1" });
  mocks.auditWrite.mockResolvedValue(undefined);
});

describe("回款计划更新 Server Action", () => {
  it("校验金额与日期后按会话权限更新，成功后审计并刷新订单详情", async () => {
    await expect(
      updatePaymentPlanForCurrentUser(
        "plan_1",
        "order_1",
        form("800.5", "2026-12-15T10:30")
      )
    ).resolves.toEqual({ ok: true, planId: "plan_1" });

    expect(mocks.updatePaymentPlan).toHaveBeenCalledWith(
      "plan_1",
      { amount: 800.5, plannedAt: new Date("2026-12-15T10:30") },
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.auditWrite).toHaveBeenCalledWith(
      owner,
      "UPDATE",
      "PaymentPlan",
      "plan_1",
      expect.stringContaining("订单 order_1 更新回款计划")
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/order_1");
  });

  it("金额 <= 0 或日期非法返回 INVALID_INPUT，不写库不审计不刷新", async () => {
    await expect(
      updatePaymentPlanForCurrentUser(
        "plan_1",
        "order_1",
        form("0", "2026-12-15T10:30")
      )
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });
    await expect(
      updatePaymentPlanForCurrentUser(
        "plan_1",
        "order_1",
        form("100", "not-a-date")
      )
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });

    expect(mocks.updatePaymentPlan).not.toHaveBeenCalled();
    expect(mocks.auditWrite).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("越权/不存在映射为 NOT_FOUND，不审计不刷新", async () => {
    mocks.updatePaymentPlan.mockRejectedValue(new mocks.PaymentNotFoundError());
    await expect(
      updatePaymentPlanForCurrentUser(
        "foreign",
        "order_1",
        form("100", "2026-12-15T10:30")
      )
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.auditWrite).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("表单入口透传绑定参数与表单数据，未登录先失败", async () => {
    const data = form("200", "2026-12-01T08:00");
    await updatePaymentPlanFormAction("plan_2", "order_2", data);
    expect(mocks.updatePaymentPlan).toHaveBeenCalledWith(
      "plan_2",
      expect.objectContaining({ amount: 200 }),
      expect.anything()
    );

    mocks.requireCurrentUser.mockRejectedValueOnce(
      new Error("UNAUTHENTICATED")
    );
    await expect(
      updatePaymentPlanFormAction("plan_3", "order_3", data)
    ).rejects.toThrow("UNAUTHENTICATED");
  });
});
