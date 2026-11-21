"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { grantAdmin, revokeAdmin } from "@/lib/db/repositories/user";

/**
 * 用户与角色管理动作。
 *
 * Server Action 可被直接 POST 调用，因此这里不依赖界面隐藏入口，而是每次
 * 从签名会话重新读取当前负责人，并再次确认角色为管理员。角色写入统一复用
 * 管理员任免服务，由其保留最后一个管理员保护与不存在用户校验。
 */
async function requireAdmin() {
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
}

function userIdFrom(formData: FormData): string {
  const value = formData.get("userId");
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("INVALID_USER_ID");
  }
  return value.trim();
}

/** 任命已有负责人为管理员。 */
export async function grantAdminAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = userIdFrom(formData);
  await grantAdmin({ id });
  revalidatePath("/settings/users");
}

/** 撤销已有负责人的管理员角色，回落为普通负责人。 */
export async function revokeAdminAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = userIdFrom(formData);
  await revokeAdmin({ id });
  revalidatePath("/settings/users");
}
