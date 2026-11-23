import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";
import {
  canTransitionOrder,
  nextOrderStatuses,
  parseOrderStatus,
} from "./order-status";

describe("订单状态机", () => {
  it("允许主链迁移：待履约 → 履约中 → 已完成", () => {
    expect(
      canTransitionOrder(OrderStatus.PENDING, OrderStatus.FULFILLING)
    ).toBe(true);
    expect(
      canTransitionOrder(OrderStatus.FULFILLING, OrderStatus.COMPLETED)
    ).toBe(true);
  });

  it("允许从待履约/履约中取消", () => {
    expect(canTransitionOrder(OrderStatus.PENDING, OrderStatus.CANCELLED)).toBe(
      true
    );
    expect(
      canTransitionOrder(OrderStatus.FULFILLING, OrderStatus.CANCELLED)
    ).toBe(true);
  });

  it("拒绝跳级、回退与终态再迁移", () => {
    expect(canTransitionOrder(OrderStatus.PENDING, OrderStatus.COMPLETED)).toBe(
      false
    );
    expect(
      canTransitionOrder(OrderStatus.FULFILLING, OrderStatus.PENDING)
    ).toBe(false);
    expect(
      canTransitionOrder(OrderStatus.COMPLETED, OrderStatus.CANCELLED)
    ).toBe(false);
    expect(
      canTransitionOrder(OrderStatus.CANCELLED, OrderStatus.FULFILLING)
    ).toBe(false);
    expect(canTransitionOrder(OrderStatus.PENDING, OrderStatus.PENDING)).toBe(
      false
    );
  });

  it("nextOrderStatuses 返回界面可用的后继列表", () => {
    expect(nextOrderStatuses(OrderStatus.PENDING)).toEqual([
      OrderStatus.FULFILLING,
      OrderStatus.CANCELLED,
    ]);
    expect(nextOrderStatuses(OrderStatus.COMPLETED)).toEqual([]);
  });

  it("parseOrderStatus 只接受合法枚举值", () => {
    expect(parseOrderStatus("FULFILLING")).toBe(OrderStatus.FULFILLING);
    expect(parseOrderStatus("BOGUS")).toBeNull();
    expect(parseOrderStatus(123)).toBeNull();
    expect(parseOrderStatus(undefined)).toBeNull();
  });
});
