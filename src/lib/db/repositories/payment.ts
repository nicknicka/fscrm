import { prisma } from "../client";
import type { AccessScope } from "@/lib/auth/scope";
import { customerOwnerWhere } from "./scoped";
import { PaymentNotFoundError } from "./not-found";

/**
 * 订单回款服务（#37）。
 *
 * 回款只挂订单；普通负责人是否可读写由订单关联客户的当前负责人决定，
 * 管理员不加负责人过滤。越权、订单不存在统一为 PaymentNotFoundError，
 * 避免在响应中区分“存在但无权”与“不存在”。
 */

// 回款与报价/合同/订单共用同一种越权/不存在错误（NOT_FOUND），实体定义在 ./not-found。
export { PaymentNotFoundError };

/** 回款登记输入：金额与到账时间始终由服务端校验后写入。 */
export interface PaymentInput {
  amount: number;
  receivedAt: Date;
}

/** 回款列表与合计、未收差额；差额以订单金额为基数计算。 */
export interface PaymentSummary {
  payments: Awaited<ReturnType<typeof prisma.payment.findMany>>;
  total: number;
  balance: number;
}

/** 登记一笔回款：先在同一事务内按权限确认订单存在，再写入回款。 */
export async function addPayment(
  orderId: string,
  input: PaymentInput,
  scope: AccessScope
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: customerOwnerWhere<{ id: string }>(scope, orderId),
      select: { id: true },
    });
    if (!order) throw new PaymentNotFoundError();

    return tx.payment.create({
      data: {
        order: { connect: { id: orderId } },
        amount: input.amount,
        receivedAt: input.receivedAt,
      },
    });
  });
}

/** 读取订单回款、合计与未收差额；越权与订单不存在统一拒绝。 */
export async function listPayments(
  orderId: string,
  scope: AccessScope
): Promise<PaymentSummary> {
  const order = await prisma.order.findFirst({
    where: customerOwnerWhere<{ id: string }>(scope, orderId),
    select: { id: true, amount: true },
  });
  if (!order) throw new PaymentNotFoundError();

  const [payments, aggregate] = await Promise.all([
    prisma.payment.findMany({
      where: { orderId },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    }),
    prisma.payment.aggregate({
      where: { orderId },
      _sum: { amount: true },
    }),
  ]);
  const total = aggregate._sum.amount ?? 0;
  return { payments, total, balance: order.amount - total };
}
