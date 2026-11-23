import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  order: { findFirst: vi.fn() },
  payment: { aggregate: vi.fn() },
  reconciliation: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  confirmReconciliation,
  listReconciliations,
  latestReconciliation,
  OrderNotFoundError,
} from "./reconciliation";

const owner = { id: "owner_1", role: "OWNER" as const };
const admin = { id: "admin_1", role: "ADMIN" as const };
const scope = (user: typeof owner | typeof admin) => ({
  userId: user.id,
  role: user.role,
});

const order = { id: "order_1", amount: 1000 };
const record = {
  id: "recon_1",
  orderId: order.id,
  receivedTotal: 600,
  balance: 400,
  confirmedBy: admin.id,
  note: "已核对",
  status: "CONFIRMED",
};

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
  prismaMock.order.findFirst.mockResolvedValue(order);
  prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 600 } });
  prismaMock.reconciliation.create.mockResolvedValue(record);
  prismaMock.reconciliation.findMany.mockResolvedValue([record]);
  prismaMock.reconciliation.findFirst.mockResolvedValue(record);
});

describe("对账服务", () => {
  it("非管理员即使传入管理员 confirmedBy 也不能确认对账（仓库层守卫）", async () => {
    await expect(
      confirmReconciliation(order.id, admin.id, null, scope(owner))
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(prismaMock.reconciliation.create).not.toHaveBeenCalled();
  });

  it("确认对账在事务内实时汇总回款，写入金额快照与 CONFIRMED 状态", async () => {
    const result = await confirmReconciliation(
      order.id,
      admin.id,
      "已核对",
      scope(admin)
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.reconciliation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receivedTotal: 600,
          balance: 400,
          confirmedBy: admin.id,
          note: "已核对",
          status: "CONFIRMED",
        }),
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: record.id }));
  });

  it("确认时忽略表单传入金额，差额由订单金额减实际回款算出", async () => {
    prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 250 } });

    await confirmReconciliation(order.id, admin.id, null, scope(admin));

    expect(prismaMock.reconciliation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ receivedTotal: 250, balance: 750 }),
      })
    );
  });

  it("订单越权或不存在时确认被拒绝，不写入", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);

    await expect(
      confirmReconciliation("foreign", admin.id, null, scope(owner))
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(prismaMock.reconciliation.create).not.toHaveBeenCalled();
  });

  it("读取历史与最近一次都按订单与权限收窄", async () => {
    const records = await listReconciliations(order.id, scope(admin));
    const latest = await latestReconciliation(order.id, scope(admin));

    expect(records).toEqual([record]);
    expect(latest).toEqual(record);
    expect(prismaMock.reconciliation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: order.id } })
    );
    expect(prismaMock.reconciliation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: order.id } })
    );
  });

  it("订单不可见时读取历史被拒绝", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    await expect(
      listReconciliations("foreign", scope(owner))
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
