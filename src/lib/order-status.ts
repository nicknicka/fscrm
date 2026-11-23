import { OrderStatus } from "@/generated/prisma/enums";

/**
 * 订单状态机：定义合法的状态迁移。
 *
 * 规则（业务约定）：
 *   PENDING    → FULFILLING（开始履约）| CANCELLED（取消）
 *   FULFILLING → COMPLETED（完成履约） | CANCELLED（取消）
 *   COMPLETED  → 终态
 *   CANCELLED  → 终态
 *
 * 这是唯一的事实来源：仓储层与界面都从这里取合法迁移，
 * 避免出现「界面给了按钮但服务端拒绝」或两套规则漂移。
 */

/** 订单状态机的非法迁移错误（对象存在且有权，但迁移不被允许）。 */
export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`INVALID_TRANSITION:${from}->${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

/** 各状态的合法后继状态。 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.FULFILLING, OrderStatus.CANCELLED],
  [OrderStatus.FULFILLING]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** 判断 from → to 是否为合法迁移。 */
export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 取某状态的合法后继列表（用于渲染操作按钮）。 */
export function nextOrderStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from] ?? [];
}

/** 把字符串解析为合法 OrderStatus；非法值返回 null。 */
export function parseOrderStatus(value: unknown): OrderStatus | null {
  if (typeof value !== "string") return null;
  const values = Object.values(OrderStatus) as string[];
  return values.includes(value) ? (value as OrderStatus) : null;
}
