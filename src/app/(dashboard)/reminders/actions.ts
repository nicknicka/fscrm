"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { dispatchReminders } from "@/lib/reminders/dispatch";

/** 手动推送结果。 */
export interface SendRemindersResult {
  ok: boolean;
  message: string;
}

/**
 * 管理员手动触发一次提醒推送。
 *
 * 复用与定时任务完全相同的 `dispatchReminders()`，
 * 保证「手动点一下」和「每天自动跑」行为一致，不会出现两套逻辑。
 */
export async function sendRemindersAction(): Promise<SendRemindersResult> {
  await requireAdmin();
  const result = await dispatchReminders();

  revalidatePath("/reminders");
  revalidatePath("/");

  const parts = [
    `扫描到 ${result.scanned} 类待办`,
    `成功推送 ${result.sent} 张卡片`,
  ];
  if (result.skippedUnbound > 0) {
    parts.push(`跳过 ${result.skippedUnbound} 类（负责人未绑定飞书）`);
  }
  if (result.failed > 0) {
    parts.push(`失败 ${result.failed} 张`);
  }

  return {
    ok: result.failed === 0,
    message: parts.join("，") + "。",
  };
}
