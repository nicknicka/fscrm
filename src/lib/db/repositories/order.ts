import { prisma } from "../client";
import type { AccessScope } from "@/lib/auth/scope";
import { customerOwnerWhere } from "./scoped";
import { OrderNotFoundError } from "./not-found";
import { OrderStatus } from "../../../generated/prisma/enums";
import {
  canTransitionOrder,
  InvalidOrderTransitionError,
} from "../../order-status";

// 订单与报价/合同/回款共用同一种越权/不存在错误（NOT_FOUND），实体定义在 ./not-found。
export { OrderNotFoundError };

/**
 * 合同转订单服务（#36）。
 *
 * 订单没有独立负责人字段：普通负责人的权限完全由订单关联客户的负责人决定，
 * 管理员可访问全部。转换与重复检查共享一个事务，失败时一起回滚，
 * 不会留下没有来源合同或状态不一致的订单。
 */

/** 订单列表与详情始终带出的来源链路。 */
const orderInclude = {
  customer: true,
  opportunity: true,
  sourceContract: true,
} as const;

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
      where: customerOwnerWhere<{ id?: string }>(scope, contractId),
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

/** 订单列表的公共 where，list 与分页 count 共用。 */
function orderListWhere(scope: AccessScope) {
  return customerOwnerWhere<{ id?: string }>(scope);
}

/** 查询订单列表；普通负责人仅见本人客户的相关订单。支持分页。 */
export async function listOrders(
  scope: AccessScope,
  pagination: { skip?: number; take?: number } = {}
) {
  return prisma.order.findMany({
    where: orderListWhere(scope),
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    skip: pagination.skip ?? 0,
    take: pagination.take ?? 50,
  });
}

/** 订单分页计数：where 与 listOrders 同源。 */
export async function countOrdersForPage(scope: AccessScope): Promise<number> {
  return prisma.order.count({ where: orderListWhere(scope) });
}

/** 按 ID 查询订单详情；越权与不存在都返回 null。 */
export async function getOrder(id: string, scope: AccessScope) {
  return prisma.order.findFirst({
    where: customerOwnerWhere<{ id?: string }>(scope, id),
    include: orderInclude,
  });
}

/**
 * 推进订单状态（事务化）。
 *
 * 读、判、写都放在一个事务里：按当前用户权限读取订单 → 校验 from→to 合法 →
 * 带权限条件 updateMany（同时防止并发下的重复/越权流转）。
 * - 越权或不存在：抛 OrderNotFoundError（与单据链其它入口一致）。
 * - 非法迁移：抛 InvalidOrderTransitionError（对象存在但不允许该迁移）。
 */
export async function transitionOrderStatus(
  id: string,
  target: OrderStatus,
  scope: AccessScope
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: customerOwnerWhere<{ id?: string }>(scope, id),
      select: { id: true, status: true },
    });
    if (!order) throw new OrderNotFoundError();

    const from = order.status as OrderStatus;
    if (!canTransitionOrder(from, target)) {
      throw new InvalidOrderTransitionError(from, target);
    }

    // updateMany 带同样的权限条件：事务内若归属变更导致不再可见，count=0 视为失败。
    const updated = await tx.order.updateMany({
      where: {
        id,
        status: from,
        ...customerOwnerWhere<{ id?: string }>(scope),
      },
      data: { status: target },
    });
    if (updated.count === 0) throw new OrderNotFoundError();

    return tx.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude,
    });
  });
}
