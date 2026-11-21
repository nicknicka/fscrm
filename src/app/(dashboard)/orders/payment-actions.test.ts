import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  addPayment: vi.fn(),
  listPayments: vi.fn(),
  PaymentNotFoundError: class PaymentNotFoundError extends Error {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db/repositories/payment", () => ({
  addPayment: mocks.addPayment,
  listPayments: mocks.listPayments,
  PaymentNotFoundError: mocks.PaymentNotFoundError,
}));

import {
  addPaymentForCurrentUser,
  listPaymentsForCurrentUser,
} from "./payment-actions";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const form = (amount: string, receivedAt: string) => {
  const data = new FormData();
  data.set("orderId", "order_1");
  data.set("amount", amount);
  data.set("receivedAt", receivedAt);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.addPayment.mockResolvedValue({ id: "payment_1" });
  mocks.listPayments.mockResolvedValue({ payments: [], total: 0, balance: 1000 });
});

describe("订单回款 Server Actions", () => {
  it("从表单读取金额与到账时间，用当前会话范围写入，成功后刷新订单详情", async () => {
    await expect(
      addPaymentForCurrentUser(form("300.5", "2026-01-02T03:04"))
    ).resolves.toEqual({ ok: true, paymentId: "payment_1" });

    expect(mocks.addPayment).toHaveBeenCalledWith(
      "order_1",
      {
        amount: 300.5,
        receivedAt: new Date("2026-01-02T03:04"),
      },
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/order_1");
  });

  it("越权订单统一返回 NOT_FOUND，失败不刷新页面", async () => {
    mocks.addPayment.mockRejectedValue(new mocks.PaymentNotFoundError());

    await expect(
      addPaymentForCurrentUser(form("1", "2026-01-02T03:04"))
    ).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("无效金额或到账时间返回 INVALID_INPUT，不调用回款服务也不刷新", async () => {
    await expect(
      addPaymentForCurrentUser(form("abc", "2026-01-02T03:04"))
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });
    await expect(
      addPaymentForCurrentUser(form("10", "not-a-date"))
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });

    expect(mocks.addPayment).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("查看回款从会话构造权限范围，管理员可查看全部订单", async () => {
    await listPaymentsForCurrentUser("order_1");
    mocks.requireCurrentUser.mockResolvedValue(admin);
    await listPaymentsForCurrentUser("order_1");

    expect(mocks.listPayments).toHaveBeenNthCalledWith(1, "order_1", {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.listPayments).toHaveBeenNthCalledWith(2, "order_1", {
      userId: admin.id,
      role: admin.role,
    });
  });

  it("所有入口先校验会话，未登录不读写", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      addPaymentForCurrentUser(form("1", "2026-01-02T03:04"))
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(listPaymentsForCurrentUser("order_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );
    expect(mocks.addPayment).not.toHaveBeenCalled();
    expect(mocks.listPayments).not.toHaveBeenCalled();
  });
});
