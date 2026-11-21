import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  convertContractToOrder: vi.fn(),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  OrderNotFoundError: class OrderNotFoundError extends Error {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/db/repositories/order", () => ({
  OrderNotFoundError: mocks.OrderNotFoundError,
  convertContractToOrder: mocks.convertContractToOrder,
  listOrders: mocks.listOrders,
  getOrder: mocks.getOrder,
}));

import {
  convertContractToOrderAction,
  getOrderForCurrentUser,
  listOrdersForCurrentUser,
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
  mocks.getOrder.mockResolvedValue({ id: "order_1" });
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

    expect(mocks.listOrders).toHaveBeenNthCalledWith(1, {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.getOrder).toHaveBeenCalledWith("order_1", {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.listOrders).toHaveBeenNthCalledWith(2, {
      userId: admin.id,
      role: admin.role,
    });
  });

  it("所有入口先校验会话，未登录不读写", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      convertContractToOrderAction("contract_1", "opportunity_own")
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(listOrdersForCurrentUser()).rejects.toThrow(
      "UNAUTHENTICATED"
    );
    await expect(getOrderForCurrentUser("order_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );

    expect(mocks.convertContractToOrder).not.toHaveBeenCalled();
    expect(mocks.listOrders).not.toHaveBeenCalled();
    expect(mocks.getOrder).not.toHaveBeenCalled();
  });
});
