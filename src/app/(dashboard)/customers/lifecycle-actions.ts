"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import { auditWrite } from "@/lib/db/repositories/audit-log";
import { updateCustomer } from "@/lib/db/repositories/customer";
import { CustomerLifecycle } from "@/generated/prisma/enums";

/**
 * 管理员调整客户生命周期阶段。
 * 这里直接使用管理员守卫，普通负责人的直接调用会被拒绝，页面表单不构成安全边界。
 */
export async function updateCustomerLifecycleAction(
  id: string,
  formData: FormData
): Promise<void> {
  const admin = await requireAdmin();
  const raw = String(formData.get("lifecycle") ?? "");
  const lifecycle = Object.values(CustomerLifecycle).find(
    (stage) => stage === raw
  );
  if (!lifecycle) {
    throw new Error("INVALID_LIFECYCLE");
  }

  await updateCustomer(id, { lifecycle }, accessScopeFor(admin));

  await auditWrite(
    admin,
    "UPDATE",
    "Customer",
    id,
    `生命周期更新为 ${lifecycle}`
  );

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
}
