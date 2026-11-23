import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  order: { findFirst: vi.fn() },
  paymentPlan: {
    create: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  payment: { aggregate: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  addPaymentPlan,
  deletePaymentPlan,
  listPaymentPlans,
  PaymentNotFoundError,
} from "./payment-plan";

const owner = { id: "owner_1", role: "OWNER" as const };
const otherOwner = { id: "owner_2", role: "OWNER" as const };
const admin = { id: "admin_1", role: "ADMIN" as const };
const scope = (user: typeof owner | typeof otherOwner | typeof admin) => ({
  userId: user.id,
  role: user.role,
});

const order = { id: "order_1", amount: 1000 };
const plan = {
  id: "plan_1",
  orderId: order.id,
  amount: 600,
  plannedAt: new Date("2026-12-01T00:00:00.000Z"),
  note: "尾款",
};

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
  prismaMock.order.findFirst.mockResolvedValue(order);
  prismaMock.paymentPlan.create.mockResolvedValue(plan);
  prismaMock.paymentPlan.findFirst.mockResolvedValue({ id: plan.id });
  prismaMock.paymentPlan.findMany.mockResolvedValue([plan]);
  prismaMock.paymentPlan.aggregate.mockResolvedValue({ _sum: { amount: 600 } });
  prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 400 } });
});

describe("回款计划服务", () => {
  it("新增计划在事务内确认订单权限后写入", async () => {
    const result = await addPaymentPlan(
      order.id,
      { amount: 600, plannedAt: plan.plannedAt, note: "尾款" },
      scope(owner)
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: order.id,
          customer: { ownerId: owner.id },
        }),
      })
    );
    expect(prismaMock.paymentPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 600,
          plannedAt: plan.plannedAt,
          note: "尾款",
        }),
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: plan.id }));
  });

  it("订单越权时新增计划被拒绝，不写入", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);

    await expect(
      addPaymentPlan(
        "foreign",
        { amount: 1, plannedAt: plan.plannedAt },
        scope(otherOwner)
      )
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
    expect(prismaMock.paymentPlan.create).not.toHaveBeenCalled();
  });

  it("删除计划带权限条件，越权/不存在统一 NOT_FOUND", async () => {
    prismaMock.paymentPlan.findFirst.mockResolvedValue(null);
    await expect(
      deletePaymentPlan("foreign", scope(otherOwner))
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
    expect(prismaMock.paymentPlan.delete).not.toHaveBeenCalled();

    prismaMock.paymentPlan.findFirst.mockResolvedValue({ id: plan.id });
    await deletePaymentPlan(plan.id, scope(owner));
    expect(prismaMock.paymentPlan.delete).toHaveBeenCalledWith({
      where: { id: plan.id },
    });
  });

  it("读取计划与实际回款对照，差额 = 计划 - 实际", async () => {
    const result = await listPaymentPlans(order.id, scope(admin));

    expect(result).toEqual(
      expect.objectContaining({
        plannedTotal: 600,
        receivedTotal: 400,
        variance: 200,
      })
    );
    expect(result.plans).toEqual([plan]);
  });

  it("无计划时计划合计为 0，差额为负的实际回款", async () => {
    prismaMock.paymentPlan.aggregate.mockResolvedValue({
      _sum: { amount: null },
    });
    prismaMock.paymentPlan.findMany.mockResolvedValue([]);

    const result = await listPaymentPlans(order.id, scope(admin));
    expect(result.plannedTotal).toBe(0);
    expect(result.variance).toBe(-400);
  });

  it("订单不可见时读取计划被拒绝", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    await expect(
      listPaymentPlans("foreign", scope(otherOwner))
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });
});
