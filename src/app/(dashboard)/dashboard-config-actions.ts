"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { saveDashboardCards } from "@/lib/analytics/dashboard-config";
import { isDashboardCard } from "@/lib/analytics/dashboard-cards";
import { auditWrite } from "@/lib/db/repositories/audit-log";

/**
 * 保存当前用户的仪表盘卡片配置。
 * 只操作会话用户自己的配置，用户之间天然隔离；非法 key 由仓储层过滤。
 */
export async function saveDashboardCardsAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const cards = formData
    .getAll("cards")
    .filter(
      (value): value is string =>
        typeof value === "string" && isDashboardCard(value)
    );
  await saveDashboardCards(user.id, cards);
  await auditWrite(
    user,
    "UPDATE",
    "DashboardConfig",
    user.id,
    "保存仪表盘卡片配置"
  );
  revalidatePath("/");
}
