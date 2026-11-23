"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { grantAdmin, revokeAdmin } from "@/lib/db/repositories/user";
import { auditWrite } from "@/lib/db/repositories/audit-log";

/**
 * 用户与角色管理动作。
 *
 * Server Action 可被直接 POST 调用，因此这里不依赖界面隐藏入口，而是每次
 * 复用签名会话的管理员守卫。角色写入统一复用用户任免服务，由其保留最后一个
 * 管理员保护与不存在用户校验。
 */

function userIdFrom(formData: FormData): string {
  const value = formData.get("userId");
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("INVALID_USER_ID");
  }
  return value.trim();
}

/** 任命已有负责人为管理员。 */
export async function grantAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = userIdFrom(formData);
  await grantAdmin({ id });
  await auditWrite(admin, "UPDATE", "User", id, "任命管理员");
  revalidatePath("/settings/users");
}

/** 撤销已有负责人的管理员角色，回落为普通负责人。 */
export async function revokeAdminAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = userIdFrom(formData);
  await revokeAdmin({ id });
  await auditWrite(admin, "UPDATE", "User", id, "撤销管理员");
  revalidatePath("/settings/users");
}
