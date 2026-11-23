import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #36 合同转订单服务外部行为测试。
 *
 * 只经过订单服务这一公开接缝：合同到订单的单次事务转换、客户/商机/来源合同
 * 关联、重复转换防护、负责人范围、越权统一 NOT_FOUND，以及订单列表与详情的
 * 来源可追溯读取。
 */

const txMock = vi.hoisted(() => ({
  contract: { findFirst: vi.fn() },
  order: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  ...txMock,
  order: { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  convertContractToOrder,
  getOrder,
  listOrders,
  OrderNotFoundError,
  transitionOrderStatus,
} from "./order";
import { InvalidOrderTransitionError } from "@/lib/order-status";
import { OrderStatus } from "@/generated/prisma/enums";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const otherOwner = { id: "owner_2", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const scope = (user: typeof owner | typeof otherOwner | typeof admin) => ({
  userId: user.id,
  role: user.role,
});

const customer = { id: "customer_own", name: "客户甲", ownerId: owner.id };
const opportunity = { id: "opportunity_own", name: "商机甲" };
const quotation = { id: "quotation_1", amount: 600 };
const contract = {
  id: "contract_1",
  customerId: customer.id,
  opportunityId: opportunity.id,
  sourceQuotationId: quotation.id,
  status: "DRAFT",
  amount: 600,
  customer,
  opportunity,
  sourceQuotation: quotation,
};
const order = {
  id: "order_1",
  status: "PENDING",
  amount: contract.amount,
  customerId: contract.customerId,
  opportunityId: contract.opportunityId,
  sourceContractId: contract.id,
  customer,
  opportunity,
  sourceContract: contract,
};

function happyPath() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
  );
  txMock.contract.findFirst.mockResolvedValue(contract);
  txMock.order.create.mockResolvedValue(order);
  txMock.order.findFirst.mockResolvedValue(null);
  txMock.order.updateMany.mockResolvedValue({ count: 1 });
  txMock.order.findUniqueOrThrow.mockResolvedValue(order);
  prismaMock.order.findMany.mockResolvedValue([]);
  prismaMock.order.findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  vi.resetAllMocks();
  happyPath();
});

describe("合同转订单服务（prisma.$transaction 接缝）", () => {
  it("把合同转为订单：一次事务内保留客户、商机与来源合同关联，金额来自合同", async () => {
    const result = await convertContractToOrder(contract.id, scope(owner));

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.contract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: contract.id,
          customer: { ownerId: owner.id },
        }),
      })
    );
    expect(txMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          amount: contract.amount,
          customer: { connect: { id: contract.customerId } },
          opportunity: { connect: { id: contract.opportunityId } },
          sourceContract: { connect: { id: contract.id } },
        }),
        include: expect.objectContaining({ sourceContract: true }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: order.id,
        sourceContractId: contract.id,
        sourceContract: expect.objectContaining({ id: contract.id }),
        customer: expect.objectContaining({ id: customer.id }),
        opportunity: expect.objectContaining({ id: opportunity.id }),
      })
    );
  });

  it("同一合同重复转换在事务内被拒绝，只有第一次写入订单", async () => {
    txMock.order.findFirst.mockResolvedValue(order);

    await expect(
      convertContractToOrder(contract.id, scope(owner))
    ).rejects.toBeInstanceOf(OrderNotFoundError);

    expect(txMock.order.create).not.toHaveBeenCalled();
  });

  it("跨负责人或合同不存在统一拒绝，且不执行任何写入", async () => {
    txMock.contract.findFirst.mockResolvedValue(null);

    await expect(
      convertContractToOrder("foreign", scope(otherOwner))
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(
      convertContractToOrder("missing", scope(admin))
    ).rejects.toThrow("NOT_FOUND");

    expect(txMock.order.create).not.toHaveBeenCalled();
  });

  it("管理员可转换任意客户的合同，读取守卫不按负责人收窄", async () => {
    await convertContractToOrder(contract.id, scope(admin));

    const where = txMock.contract.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe(contract.id);
    expect(where).not.toHaveProperty("customer");
    expect(txMock.order.create).toHaveBeenCalledTimes(1);
  });

  it("订单列表按权限收窄，并始终带出客户、商机与来源合同", async () => {
    await listOrders(scope(admin));
    await listOrders(scope(owner));

    expect(prismaMock.order.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {},
        include: expect.objectContaining({
          sourceContract: true,
          customer: true,
          opportunity: true,
        }),
      })
    );
    expect(prismaMock.order.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { customer: { ownerId: owner.id } },
      })
    );
  });

  it("详情越权与不存在统一返回 null，存在时来源合同可追溯", async () => {
    await expect(getOrder("foreign", scope(otherOwner))).resolves.toBeNull();

    prismaMock.order.findFirst.mockResolvedValue(order);
    await expect(getOrder(order.id, scope(owner))).resolves.toEqual(
      expect.objectContaining({
        sourceContractId: contract.id,
        sourceContract: expect.objectContaining({ id: contract.id }),
      })
    );
    expect(prismaMock.order.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: order.id,
          customer: { ownerId: owner.id },
        }),
        include: expect.objectContaining({ sourceContract: true }),
      })
    );
  });
});

describe("订单状态流转（事务）", () => {
  it("合法迁移在事务内写入，且 updateMany 带权限与当前状态条件", async () => {
    txMock.order.findFirst.mockResolvedValue({
      id: order.id,
      status: "PENDING",
    });
    txMock.order.findUniqueOrThrow.mockResolvedValue({
      ...order,
      status: "FULFILLING",
    });

    const result = await transitionOrderStatus(
      order.id,
      OrderStatus.FULFILLING,
      scope(owner)
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: order.id,
          status: "PENDING",
          customer: { ownerId: owner.id },
        }),
        data: { status: "FULFILLING" },
      })
    );
    expect(result).toEqual(expect.objectContaining({ status: "FULFILLING" }));
  });

  it("非法迁移（跳级）被拒绝，不写入", async () => {
    txMock.order.findFirst.mockResolvedValue({
      id: order.id,
      status: "PENDING",
    });

    await expect(
      transitionOrderStatus(order.id, OrderStatus.COMPLETED, scope(owner))
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(txMock.order.updateMany).not.toHaveBeenCalled();
  });

  it("终态不能再迁移", async () => {
    txMock.order.findFirst.mockResolvedValue({
      id: order.id,
      status: "CANCELLED",
    });

    await expect(
      transitionOrderStatus(order.id, OrderStatus.FULFILLING, scope(owner))
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(txMock.order.updateMany).not.toHaveBeenCalled();
  });

  it("越权或订单不存在统一抛 NOT_FOUND，不写入", async () => {
    txMock.order.findFirst.mockResolvedValue(null);

    await expect(
      transitionOrderStatus(
        "foreign",
        OrderStatus.FULFILLING,
        scope(otherOwner)
      )
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(txMock.order.updateMany).not.toHaveBeenCalled();
  });

  it("并发下归属变化导致 updateMany 计数为 0 时视为失败", async () => {
    txMock.order.findFirst.mockResolvedValue({
      id: order.id,
      status: "PENDING",
    });
    txMock.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      transitionOrderStatus(order.id, OrderStatus.FULFILLING, scope(owner))
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
