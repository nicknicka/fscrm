"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  addPayment,
  listPayments,
  PaymentNotFoundError,
} from "@/lib/db/repositories/payment";

/** 回款 Server Action 结果：失败时统一返回稳定错误码，不泄露订单存在性。 */
type ActionResult =
  | { ok: true; paymentId: string }
  | { ok: false; error: "NOT_FOUND" | "INVALID_INPUT" };

/**
 * 从表单登记回款。订单、金额与到账时间都来自表单，但权限由会话决定；
 * 只有写入成功后才重新验证订单详情页。
 */
export async function addPaymentForCurrentUser(
  formData: FormData
): Promise<ActionResult> {
  const currentUser = await requireCurrentUser();
  const orderId = formData.get("orderId");
  const rawAmount = formData.get("amount");
  const rawReceivedAt = formData.get("receivedAt");

  const amount =
    typeof rawAmount === "string" && rawAmount.trim()
      ? Number(rawAmount)
      : Number.NaN;
  const receivedAt =
    typeof rawReceivedAt === "string" && rawReceivedAt.trim()
      ? new Date(rawReceivedAt)
      : new Date(Number.NaN);

  if (
    typeof orderId !== "string" ||
    !orderId ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Number.isNaN(receivedAt.getTime())
  ) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  try {
    const payment = await addPayment(
      orderId,
      { amount, receivedAt },
      accessScopeFor(currentUser)
    );
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, paymentId: payment.id };
  } catch (error) {
    if (error instanceof PaymentNotFoundError) {
      return { ok: false, error: "NOT_FOUND" };
    }
    throw error;
  }
}

/** 订单详情读取回款与合计、差额；权限由会话决定。 */
export async function listPaymentsForCurrentUser(orderId: string) {
  const currentUser = await requireCurrentUser();
  return listPayments(orderId, accessScopeFor(currentUser));
}
