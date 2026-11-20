"use server";

import { revalidatePath } from "next/cache";
import { runContactSync } from "@/lib/services/contact-sync";
import type { RunContactSyncResult } from "@/lib/services/contact-sync";

/**
 * 手动触发通讯录同步。
 *
 * 以表单 action 形式调用，返回同步结果供页面展示；不重定向。
 */
export async function syncContactsAction(): Promise<RunContactSyncResult> {
  const outcome = await runContactSync();
  revalidatePath("/settings");
  revalidatePath("/");
  return outcome;
}
