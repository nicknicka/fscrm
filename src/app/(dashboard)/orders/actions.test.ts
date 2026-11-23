import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  convertContractToOrder: vi.fn(),
  listOrders: vi.fn(),
  countOrdersForPage: vi.fn(),
  getOrder: vi.fn(),
  transitionOrderStatus: vi.fn(),
  OrderNotFoundError: class OrderNotFoundError extends Error {},
  InvalidOrderTransitionError: class InvalidOrderTransitionError extends Error {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/db/repositories/order", () => ({
  OrderNotFoundError: mocks.OrderNotFoundError,
  convertContractToOrder: mocks.convertContractToOrder,
  listOrders: mocks.listOrders,
  countOrdersForPage: mocks.countOrdersForPage,
  getOrder: mocks.getOrder,
  transitionOrderStatus: mocks.transitionOrderStatus,
}));

vi.mock("@/lib/order-status", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/order-status")>();
  return {
    ...actual,
    InvalidOrderTransitionError: mocks.InvalidOrderTransitionError,
  };
});

import {
  convertContractToOrderAction,
  getOrderForCurrentUser,
  listOrdersForCurrentUser,
  transitionOrderStatusAction,
} from "./actions";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const otherOwner = { id: "owner_2", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.convertContractToOrder.mockResolvedValue({
    id: "order_1",
    sourceContractId: "contract_1",
  });
  mocks.listOrders.mockResolvedValue([]);
  mocks.countOrdersForPage.mockResolvedValue(0);
  mocks.getOrder.mockResolvedValue({ id: "order_1" });
  mocks.transitionOrderStatus.mockResolvedValue({
    id: "order_1",
    status: "FULFILLING",
  });
});

describe("订单 Server Actions", () => {
  it("负责人把合同转为订单时传当前权限范围，成功后刷新合同与订单页", async () => {
    const result = await convertContractToOrderAction(
      "contract_1",
      "opportunity_own"
    );

    expect(result).toEqual({ ok: true, orderId: "order_1" });
    expect(mocks.convertContractToOrder).toHaveBeenCalledWith("contract_1", {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/opportunity_own"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/contracts/contract_1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/order_1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders");
  });

  it("重复转换、越权转换与合同不存在统一返回 NOT_FOUND，失败不刷新任何页面", async () => {
    mocks.requireCurrentUser.mockResolvedValue(otherOwner);
    mocks.convertContractToOrder.mockRejectedValue(
      new mocks.OrderNotFoundError()
    );

    await expect(
      convertContractToOrderAction("foreign_contract", "foreign_opportunity")
    ).resolves.toEqual(NOT_FOUND);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("列表与详情读取从会话构造权限范围，管理员可见全部", async () => {
    await listOrdersForCurrentUser();
    await getOrderForCurrentUser("order_1");
    mocks.requireCurrentUser.mockResolvedValue(admin);
    await listOrdersForCurrentUser();

    expect(mocks.listOrders).toHaveBeenNthCalledWith(
      1,
      {
        userId: owner.id,
        role: owner.role,
      },
      {}
    );
    expect(mocks.getOrder).toHaveBeenCalledWith("order_1", {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.listOrders).toHaveBeenNthCalledWith(
      2,
      {
        userId: admin.id,
        role: admin.role,
      },
      {}
    );
  });

  it("所有入口先校验会话，未登录不读写", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      convertContractToOrderAction("contract_1", "opportunity_own")
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(listOrdersForCurrentUser()).rejects.toThrow("UNAUTHENTICATED");
    await expect(getOrderForCurrentUser("order_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );

    expect(mocks.convertContractToOrder).not.toHaveBeenCalled();
    expect(mocks.listOrders).not.toHaveBeenCalled();
    expect(mocks.getOrder).not.toHaveBeenCalled();
  });
});

describe("订单状态流转 Server Action", () => {
  const form = (status: unknown) => {
    const data = new FormData();
    if (status !== undefined) data.set("status", String(status));
    return data;
  };

  it("合法目标状态下调用仓储并刷新列表与详情", async () => {
    const result = await transitionOrderStatusAction(
      "order_1",
      form("FULFILLING")
    );

    expect(mocks.transitionOrderStatus).toHaveBeenCalledWith(
      "order_1",
      "FULFILLING",
      expect.anything()
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/order_1");
    expect(result).toEqual({ ok: true, status: "FULFILLING" });
  });

  it("非法状态值返回 INVALID_INPUT，不调用仓储", async () => {
    const result = await transitionOrderStatusAction("order_1", form("BOGUS"));
    expect(result).toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(mocks.transitionOrderStatus).not.toHaveBeenCalled();
  });

  it("越权/不存在映射为 NOT_FOUND", async () => {
    mocks.transitionOrderStatus.mockRejectedValueOnce(
      new mocks.OrderNotFoundError()
    );
    const result = await transitionOrderStatusAction(
      "order_1",
      form("FULFILLING")
    );
    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("非法迁移映射为 INVALID_TRANSITION", async () => {
    mocks.transitionOrderStatus.mockRejectedValueOnce(
      new mocks.InvalidOrderTransitionError()
    );
    const result = await transitionOrderStatusAction(
      "order_1",
      form("COMPLETED")
    );
    expect(result).toEqual({ ok: false, error: "INVALID_TRANSITION" });
  });

  it("未知错误继续抛出，不被吞掉", async () => {
    mocks.transitionOrderStatus.mockRejectedValueOnce(new Error("db down"));
    await expect(
      transitionOrderStatusAction("order_1", form("FULFILLING"))
    ).rejects.toThrow("db down");
  });
});
