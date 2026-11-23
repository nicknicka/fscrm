import { prisma } from "@/lib/db/client";
import {
  DEFAULT_CARDS,
  normalizeCards,
  type DashboardCard,
} from "@/lib/analytics/dashboard-cards";

/**
 * 用户仪表盘配置服务：每位用户一组有序卡片 key。
 * 没有配置时返回默认全集；保存时整体覆盖（upsert）。
 */
export async function getDashboardCards(
  userId: string
): Promise<DashboardCard[]> {
  const config = await prisma.dashboardConfig.findUnique({
    where: { userId },
    select: { cards: true },
  });
  return config ? normalizeCards(config.cards) : [...DEFAULT_CARDS];
}

/** 保存（或首次创建）当前用户的仪表盘卡片配置。非法卡片 key 会被过滤。 */
export async function saveDashboardCards(
  userId: string,
  cards: unknown
): Promise<DashboardCard[]> {
  const normalized = normalizeCards(cards);
  await prisma.dashboardConfig.upsert({
    where: { userId },
    create: { userId, cards: normalized },
    update: { cards: normalized },
  });
  return normalized;
}
