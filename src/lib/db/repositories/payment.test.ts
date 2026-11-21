import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  order: { findFirst: vi.fn() },
  payment: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  PaymentNotFoundError,
  addPayment,
  PaymentSummary,
  listPayments,
} from "./payment";

const owner = { id: "owner_1", role: "OWNER" as const };
const otherOwner = { id: "owner_2", role: "OWNER" as const };
const admin = { id: "admin_1", role: "ADMIN" as const };
const scope = (user: typeof owner | typeof otherOwner | typeof admin) => ({
  userId: user.id,
  role: user.role,
});

const order = {
  id: "order_1",
  amount: 1000,
  customer: { id: "customer_own", ownerId: owner.id },
};
const first = {
  id: "payment_1",
  orderId: order.id,
  amount: 300,
  receivedAt: new Date("2026-01-02T03:04:05.000Z"),
};
const second = {
  id: "payment_2",
  orderId: order.id,
  amount: 200.5,
  receivedAt: new Date("2026-02-03T04:05:06.000Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
  prismaMock.order.findFirst.mockResolvedValue(order);
  prismaMock.payment.create.mockResolvedValue(first);
  prismaMock.payment.findMany.mockResolvedValue([first, second]);
  prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 500.5 } });
});

describe("订单回款服务", () => {
  it("同一订单登记多笔回款", async () => {
    await addPayment(order.id, { amount: 300, receivedAt: first.receivedAt }, scope(owner));
    prismaMock.payment.create.mockResolvedValue(second);
    await addPayment(
      order.id,
      { amount: 200.5, receivedAt: second.receivedAt },
      scope(owner)
    );

    expect(prismaMock.order.findFirst).toHaveBeenCalledTimes(2);
    expect(prismaMock.payment.create).toHaveBeenNthCalledWith(1, {
      data: {
        order: { connect: { id: order.id } },
        amount: 300,
        receivedAt: first.receivedAt,
      },
    });
    expect(prismaMock.payment.create).toHaveBeenNthCalledWith(2, {
      data: {
        order: { connect: { id: order.id } },
        amount: 200.5,
        receivedAt: second.receivedAt,
      },
    });
  });

  it("回款合计与未收差额按订单金额和每笔回款计算", async () => {
    const result: PaymentSummary = await listPayments(order.id, scope(owner));

    expect(result).toEqual({
      payments: [first, second],
      total: 500.5,
      balance: 499.5,
    });
    expect(prismaMock.payment.findMany).toHaveBeenCalledWith({
      where: { orderId: order.id },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    });
    expect(prismaMock.payment.aggregate).toHaveBeenCalledWith({
      where: { orderId: order.id },
      _sum: { amount: true },
    });
  });

  it("普通负责人只能给本人负责客户的订单登记与查看回款", async () => {
    await addPayment(
      order.id,
      { amount: 300, receivedAt: first.receivedAt },
      scope(owner)
    );
    await listPayments(order.id, scope(owner));

    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
      where: { id: order.id, customer: { ownerId: owner.id } },
      select: { id: true, amount: true },
    });
  });

  it("跨负责人登记与查看统一拒绝为 NOT_FOUND，且不写回款", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);

    await expect(
      addPayment(order.id, { amount: 300, receivedAt: first.receivedAt }, scope(otherOwner))
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
    await expect(
      listPayments(order.id, scope(otherOwner))
    ).rejects.toBeInstanceOf(PaymentNotFoundError);

    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
  });

  it("管理员可登记与查看任意订单回款，不加负责人过滤", async () => {
    await addPayment(
      order.id,
      { amount: 300, receivedAt: first.receivedAt },
      scope(admin)
    );
    await listPayments(order.id, scope(admin));

    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
      where: { id: order.id },
      select: { id: true, amount: true },
    });
  });
});
