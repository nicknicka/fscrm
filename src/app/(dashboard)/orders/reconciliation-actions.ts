"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireAdmin } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  confirmReconciliation,
  latestReconciliation,
  listReconciliations,
  OrderNotFoundError,
} from "@/lib/db/repositories/reconciliation";

/** 对账确认结果：失败返回稳定错误码。 */
type ReconcileResult =
  | { ok: true; reconciliationId: string }
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN" };

/**
 * 管理员确认对账。金额由服务端从回款实时汇总，表单只带订单 ID 与备注；
 * 非管理员直接拒绝（财务审计职责，见 ADR-0003）。
 */
export async function confirmReconciliationForAdmin(
  formData: FormData
): Promise<ReconcileResult> {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return { ok: false, error: "FORBIDDEN" };

  const orderId = formData.get("orderId");
  const note = formData.get("note");
  if (typeof orderId !== "string" || !orderId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  try {
    const record = await confirmReconciliation(
      orderId,
      admin.id,
      typeof note === "string" && note.trim() ? note.trim() : null,
      accessScopeFor(admin)
    );
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, reconciliationId: record.id };
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return { ok: false, error: "NOT_FOUND" };
    }
    throw error;
  }
}

/** 表单专用入口（`<form action>` 要求返回 void）。 */
export async function confirmReconciliationFormAction(
  formData: FormData
): Promise<void> {
  await confirmReconciliationForAdmin(formData);
}

/** 读取订单对账历史与最近一次；权限由会话决定。 */
export async function listReconciliationsForCurrentUser(orderId: string) {
  const user = await getCurrentUser();
  if (!user) return { records: [], latest: null };
  const scope = accessScopeFor(user);
  const [records, latest] = await Promise.all([
    listReconciliations(orderId, scope),
    latestReconciliation(orderId, scope),
  ]);
  return { records, latest };
}
