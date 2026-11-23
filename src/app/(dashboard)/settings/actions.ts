"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { runContactSync } from "@/lib/services/contact-sync";
import type { RunContactSyncResult } from "@/lib/services/contact-sync";
import { auditWrite } from "@/lib/db/repositories/audit-log";

/**
 * 手动触发通讯录同步。
 *
 * 每个 Server Action 都从签名会话重新认证；任何人（包括构造表单请求）都
 * 不能绕过登录直接触发飞书 API 调用。当前业务角色都可使用设置页同步按钮。
 */
export async function syncContactsAction(): Promise<RunContactSyncResult> {
  const user = await requireCurrentUser();
  const outcome = await runContactSync();
  if (outcome.ok) {
    await auditWrite(user, "SYNC", "ContactSync", "current", "手动同步通讯录");
  }
  revalidatePath("/settings");
  revalidatePath("/");
  return outcome;
}
