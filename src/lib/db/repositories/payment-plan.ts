import { prisma } from "../client";
import type { AccessScope } from "@/lib/auth/scope";
import { ownerWhere } from "@/lib/auth/scope";
import { customerOwnerWhere } from "./scoped";
import { PaymentNotFoundError } from "./not-found";

// 与 payment.ts 一致，重新导出错误类，调用方从本服务导入即可判定。
export { PaymentNotFoundError };

/**
 * 回款计划服务（#62）。
 *
 * 计划挂订单；权限路径为「计划 → 订单 → 客户负责人」，
 * 与回款/Payment 一致。越权或订单不存在统一为 PaymentNotFoundError。
 */

/** 回款计划输入：金额与计划到账时间由服务端校验后写入。 */
export interface PaymentPlanInput {
  amount: number;
  plannedAt: Date;
  note?: string | null;
}

/** 按当前用户权限构造订单的 where（用于先确认订单可见）。 */
function orderWhere(scope: AccessScope, orderId: string) {
  const customerScope = ownerWhere(scope) as { ownerId?: string };
  return {
    id: orderId,
    ...(customerScope.ownerId
      ? { customer: { ownerId: customerScope.ownerId } }
      : {}),
  };
}

/** 按当前用户权限构造计划自身的 where（计划 → 订单 → 客户）。 */
function planWhere(scope: AccessScope, planId: string) {
  const customerScope = ownerWhere(scope) as { ownerId?: string };
  return {
    id: planId,
    ...(customerScope.ownerId
      ? { order: { customer: { ownerId: customerScope.ownerId } } }
      : {}),
  };
}

/** 新增一条回款计划：事务内先确认订单在当前权限内可见，再写入。 */
export async function addPaymentPlan(
  orderId: string,
  input: PaymentPlanInput,
  scope: AccessScope
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: orderWhere(scope, orderId),
      select: { id: true },
    });
    if (!order) throw new PaymentNotFoundError();

    return tx.paymentPlan.create({
      data: {
        order: { connect: { id: orderId } },
        amount: input.amount,
        plannedAt: input.plannedAt,
        note: input.note ?? null,
      },
    });
  });
}

/**
 * 更新一条回款计划的金额与时间。
 *
 * 权限路径为「计划 → 订单 → 客户负责人」，与新增/删除一致。读到计划与条件更新
 * 放在同一事务内；`updateMany` 的 where 直接带权限条件，避免先查后改之间的窗口。
 * 越权、不存在或事务内归属变化导致 count=0，统一抛 PaymentNotFoundError。
 */
export async function updatePaymentPlan(
  planId: string,
  input: Pick<PaymentPlanInput, "amount" | "plannedAt">,
  scope: AccessScope
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.paymentPlan.findFirst({
      where: planWhere(scope, planId),
      select: { orderId: true },
    });
    if (!existing) throw new PaymentNotFoundError();

    // 权限条件随 updateMany 同语句执行，事务内归属变化也会让 count=0。
    const updated = await tx.paymentPlan.updateMany({
      where: {
        id: planId,
        order: { ...customerOwnerWhere<{ id?: string }>(scope) },
      },
      data: {
        amount: input.amount,
        plannedAt: input.plannedAt,
      },
    });
    if (updated.count === 0) throw new PaymentNotFoundError();

    return tx.paymentPlan.findUniqueOrThrow({ where: { id: planId } });
  });
}

/**
 * 删除一条回款计划：事务内以 `deleteMany` 带权限条件单语句执行。
 * 不再先查后删；越权、不存在或并发下归属变化导致 count=0 统一抛 PaymentNotFoundError。
 */
export async function deletePaymentPlan(planId: string, scope: AccessScope) {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.paymentPlan.deleteMany({
      where: planWhere(scope, planId),
    });
    if (deleted.count === 0) throw new PaymentNotFoundError();
    return deleted;
  });
}

/**
 * 读取订单的回款计划，并与实际回款对照。
 *
 * 返回计划列表、计划合计、实际回款合计、以及「计划 - 实际」的差额。
 * 权限由订单可见性保证。
 */
export async function listPaymentPlans(orderId: string, scope: AccessScope) {
  const order = await prisma.order.findFirst({
    where: orderWhere(scope, orderId),
    select: { id: true },
  });
  if (!order) throw new PaymentNotFoundError();

  const [plans, planAggregate, paymentAggregate] = await Promise.all([
    prisma.paymentPlan.findMany({
      where: { orderId },
      orderBy: [{ plannedAt: "desc" }, { id: "desc" }],
    }),
    prisma.paymentPlan.aggregate({
      where: { orderId },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { orderId },
      _sum: { amount: true },
    }),
  ]);
  const plannedTotal = planAggregate._sum.amount ?? 0;
  const receivedTotal = paymentAggregate._sum.amount ?? 0;
  return {
    plans,
    plannedTotal,
    receivedTotal,
    variance: plannedTotal - receivedTotal,
  };
}
