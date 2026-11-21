import { ownerWhere, type AccessScope } from "@/lib/auth/scope";

/**
 * 单据类仓储共用的权限收窄查询构造。
 *
 * 报价、合同、订单都没有独立负责人字段：普通负责人的可见范围完全由关联客户的
 * 负责人决定；回款只挂订单，因此沿「回款 → 订单 → 客户」同一路径收窄。
 * 管理员不加负责人过滤，与 `ownerWhere` 的语义保持一致。
 */

/** 关联客户负责人的收窄条件（管理员为空对象）。 */
type CustomerOwnerFilter = { customer?: { ownerId: string } };

/**
 * 按关联客户负责人收窄的 Prisma where 条件。
 *
 * 管理员返回空条件；普通负责人返回 `{ customer: { ownerId } }`。
 * `id` 可选：不传时用于列表查询，传时用于按 ID 读取详情。
 */
export function customerOwnerWhere<T extends { id?: string } = { id?: string }>(
  scope: AccessScope,
  id?: string
): T & CustomerOwnerFilter {
  const where: Record<string, unknown> = {};
  if (id) where.id = id;
  const customerScope = ownerWhere(scope) as { ownerId?: string };
  if (customerScope.ownerId) {
    where.customer = { ownerId: customerScope.ownerId };
  }
  return where as T & CustomerOwnerFilter;
}
