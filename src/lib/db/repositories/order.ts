import { prisma } from "../client";
import { ownerWhere, type AccessScope } from "@/lib/auth/scope";
import { OrderStatus } from "../../../generated/prisma/enums";

/**
 * 合同转订单服务（#36）。
 *
 * 订单没有独立负责人字段：普通负责人的权限完全由订单关联客户的负责人决定，
 * 管理员可访问全部。转换与重复检查共享一个事务，失败时一起回滚，
 * 不会留下没有来源合同或状态不一致的订单。
 */

/** 越权、合同不存在或重复转换时统一返回该错误，避免泄露合同存在性。 */
export class OrderNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "OrderNotFoundError";
  }
}

/** 订单列表与详情始终带出的来源链路。 */
const orderInclude = {
  customer: true,
  opportunity: true,
  sourceContract: true,
} as const;

/** 把权限范围转成订单/合同的 Prisma where 条件。 */
function scopedWhere(
  scope: AccessScope,
  id?: string
): { id?: string; customer?: { ownerId: string } } {
  const where: { id?: string; customer?: { ownerId: string } } = {};
  if (id) where.id = id;
  const customerScope = ownerWhere(scope) as { ownerId?: string };
  if (customerScope.ownerId) {
    where.customer = { ownerId: customerScope.ownerId };
  }
  return where;
}

/**
 * 把合同转为订单。
 *
 * 先在事务内按权限读取合同；同一合同的订单不存在时创建订单，
 * 保留客户、商机与来源合同三条关联。来源合同唯一，避免重复转换产生孤儿数据。
 */
export async function convertContractToOrder(
  contractId: string,
  scope: AccessScope
) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findFirst({
      where: scopedWhere(scope, contractId),
      select: {
        id: true,
        customerId: true,
        opportunityId: true,
        status: true,
        amount: true,
      },
    });
    if (!contract) {
      throw new OrderNotFoundError();
    }

    const existing = await tx.order.findFirst({
      where: { sourceContractId: contract.id },
      select: { id: true },
    });
    if (existing) {
      throw new OrderNotFoundError();
    }

    return tx.order.create({
      data: {
        status: OrderStatus.PENDING,
        amount: contract.amount,
        customer: { connect: { id: contract.customerId } },
        opportunity: { connect: { id: contract.opportunityId } },
        sourceContract: { connect: { id: contract.id } },
      },
      include: orderInclude,
    });
  });
}

/** 查询订单列表；普通负责人仅见本人客户的相关订单。 */
export async function listOrders(scope: AccessScope) {
  return prisma.order.findMany({
    where: scopedWhere(scope),
    include: orderInclude,
    orderBy: { createdAt: "desc" },
  });
}

/** 按 ID 查询订单详情；越权与不存在都返回 null。 */
export async function getOrder(id: string, scope: AccessScope) {
  return prisma.order.findFirst({
    where: scopedWhere(scope, id),
    include: orderInclude,
  });
}
