import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  order: { findFirst: vi.fn() },
  paymentPlan: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  payment: { aggregate: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  addPaymentPlan,
  updatePaymentPlan,
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
  prismaMock.paymentPlan.findUniqueOrThrow.mockResolvedValue(plan);
  prismaMock.paymentPlan.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.paymentPlan.deleteMany.mockResolvedValue({ count: 1 });
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

  it("更新在事务内带权限条件原子写入金额与时间", async () => {
    const next = {
      amount: 800,
      plannedAt: new Date("2026-12-15T00:00:00.000Z"),
    };
    const result = await updatePaymentPlan(plan.id, next, scope(owner));

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.paymentPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: plan.id,
          order: { customer: { ownerId: owner.id } },
        }),
      })
    );
    expect(prismaMock.paymentPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: plan.id,
          order: { customer: { ownerId: owner.id } },
        }),
        data: { amount: next.amount, plannedAt: next.plannedAt },
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: plan.id }));
  });

  it("更新越权/不存在，或事务内条件更新 count=0 时抛 NOT_FOUND", async () => {
    prismaMock.paymentPlan.findFirst.mockResolvedValue(null);
    await expect(
      updatePaymentPlan(
        "foreign",
        { amount: 1, plannedAt: plan.plannedAt },
        scope(otherOwner)
      )
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
    expect(prismaMock.paymentPlan.updateMany).not.toHaveBeenCalled();

    prismaMock.paymentPlan.findFirst.mockResolvedValue({ id: plan.id });
    prismaMock.paymentPlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      updatePaymentPlan(
        plan.id,
        { amount: 1, plannedAt: plan.plannedAt },
        scope(owner)
      )
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it("删除在事务内用 deleteMany 带权限条件单步完成，count=0 抛 NOT_FOUND", async () => {
    prismaMock.paymentPlan.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      deletePaymentPlan("foreign", scope(otherOwner))
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
    expect(prismaMock.paymentPlan.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.paymentPlan.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "foreign",
        order: { customer: { ownerId: otherOwner.id } },
      },
    });

    prismaMock.paymentPlan.deleteMany.mockResolvedValue({ count: 1 });
    await deletePaymentPlan(plan.id, scope(admin));
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.paymentPlan.deleteMany).toHaveBeenLastCalledWith({
      where: { id: plan.id },
    });
    expect(prismaMock.paymentPlan.delete).not.toHaveBeenCalled();
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
