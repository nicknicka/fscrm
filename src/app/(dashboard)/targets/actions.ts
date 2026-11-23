"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { setSalesTarget } from "@/lib/db/repositories/sales-target";
import { auditWrite } from "@/lib/db/repositories/audit-log";

/** 管理员设置某用户某月的业绩目标；非法输入直接拒绝。 */
export async function setSalesTargetAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = formData.get("userId");
  const month = formData.get("month");
  const rawAmount = formData.get("amount");
  const note = formData.get("note");
  const amount = typeof rawAmount === "string" ? Number(rawAmount) : Number.NaN;

  if (
    typeof userId !== "string" ||
    !userId ||
    typeof month !== "string" ||
    !/^\d{4}-\d{2}$/.test(month) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return;
  }

  const target = await setSalesTarget(
    userId,
    month,
    amount,
    typeof note === "string" && note.trim() ? note.trim() : null
  );
  await auditWrite(
    admin,
    "UPSERT",
    "SalesTarget",
    target.id,
    `设置 ${month} 业绩目标`
  );
  revalidatePath("/targets");
}
