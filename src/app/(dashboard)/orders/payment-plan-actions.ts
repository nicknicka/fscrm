"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  addPaymentPlan,
  deletePaymentPlan,
  listPaymentPlans,
  PaymentNotFoundError,
} from "@/lib/db/repositories/payment-plan";

/** 回款计划 Server Action 结果：失败返回稳定错误码，不泄露订单存在性。 */
type PlanActionResult =
  | { ok: true; planId?: string }
  | { ok: false; error: "NOT_FOUND" | "INVALID_INPUT" };

/** 从表单新增回款计划；金额与计划时间由服务端校验，权限由会话决定。 */
export async function addPaymentPlanForCurrentUser(
  formData: FormData
): Promise<PlanActionResult> {
  const currentUser = await requireCurrentUser();
  const orderId = formData.get("orderId");
  const rawAmount = formData.get("amount");
  const rawPlannedAt = formData.get("plannedAt");
  const note = formData.get("note");

  const amount =
    typeof rawAmount === "string" && rawAmount.trim()
      ? Number(rawAmount)
      : Number.NaN;
  const plannedAt =
    typeof rawPlannedAt === "string" && rawPlannedAt.trim()
      ? new Date(rawPlannedAt)
      : new Date(Number.NaN);

  if (
    typeof orderId !== "string" ||
    !orderId ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Number.isNaN(plannedAt.getTime())
  ) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  try {
    const plan = await addPaymentPlan(
      orderId,
      {
        amount,
        plannedAt,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
      },
      accessScopeFor(currentUser)
    );
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, planId: plan.id };
  } catch (error) {
    if (error instanceof PaymentNotFoundError) {
      return { ok: false, error: "NOT_FOUND" };
    }
    throw error;
  }
}

/** 表单专用删除入口（`<form action>` 要求返回 void）。 */
export async function deletePaymentPlanFormAction(
  planId: string,
  orderId: string,
  _formData: FormData
): Promise<void> {
  const currentUser = await requireCurrentUser();
  try {
    await deletePaymentPlan(planId, accessScopeFor(currentUser));
  } catch (error) {
    if (!(error instanceof PaymentNotFoundError)) throw error;
  }
  revalidatePath(`/orders/${orderId}`);
}

/** 读取订单回款计划与对照；权限由会话决定。 */
export async function listPaymentPlansForCurrentUser(orderId: string) {
  const currentUser = await requireCurrentUser();
  return listPaymentPlans(orderId, accessScopeFor(currentUser));
}

/** 表单专用新增入口（`<form action>` 要求返回 void）；业务结果由 addPaymentPlanForCurrentUser 承载。 */
export async function addPaymentPlanFormAction(
  _formData: FormData
): Promise<void> {
  await addPaymentPlanForCurrentUser(_formData);
}
