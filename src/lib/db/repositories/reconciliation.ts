import { prisma } from "../client";
import type { AccessScope } from "@/lib/auth/scope";
import { customerOwnerWhere } from "./scoped";
import { OrderNotFoundError } from "./not-found";
import { ReconciliationStatus } from "@/generated/prisma/enums";

// 重新导出错误类，调用方从本服务导入即可判定。
export { OrderNotFoundError };

/**
 * 对账服务（#63）。
 *
 * 对账确认把「当时的已回款合计与差额」记成一条不可变快照，可多次确认并留历史。
 * 金额始终在事务内从 Payment 实时汇总，不接收表单传入的金额，避免伪造。
 * 权限路径与订单一致（客户负责人）；确认仅管理员可执行——守卫下沉到仓储层，
 * 这样无论从 Server Action、飞书还是脚本调用都不会绕过。
 */

/** 新增一条对账确认：事务内实时汇总回款，写入金额快照。仅管理员可确认。 */
export async function confirmReconciliation(
  orderId: string,
  confirmedBy: string,
  note: string | null,
  scope: AccessScope
) {
  if (scope.role !== "ADMIN") throw new OrderNotFoundError();
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: customerOwnerWhere<{ id?: string }>(scope, orderId),
      select: { id: true, amount: true },
    });
    if (!order) throw new OrderNotFoundError();

    const aggregate = await tx.payment.aggregate({
      where: { orderId },
      _sum: { amount: true },
    });
    const receivedTotal = aggregate._sum.amount ?? 0;

    return tx.reconciliation.create({
      data: {
        order: { connect: { id: orderId } },
        receivedTotal,
        balance: order.amount - receivedTotal,
        confirmedBy,
        note,
        status: ReconciliationStatus.CONFIRMED,
      },
    });
  });
}

/** 读取订单的对账历史（最近在前），越权与不存在统一 NOT_FOUND。 */
export async function listReconciliations(orderId: string, scope: AccessScope) {
  const order = await prisma.order.findFirst({
    where: customerOwnerWhere<{ id?: string }>(scope, orderId),
    select: { id: true },
  });
  if (!order) throw new OrderNotFoundError();

  return prisma.reconciliation.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
}

/** 最近一次对账记录；没有则返回 null。 */
export async function latestReconciliation(
  orderId: string,
  scope: AccessScope
) {
  const order = await prisma.order.findFirst({
    where: customerOwnerWhere<{ id?: string }>(scope, orderId),
    select: { id: true },
  });
  if (!order) throw new OrderNotFoundError();

  return prisma.reconciliation.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
}
