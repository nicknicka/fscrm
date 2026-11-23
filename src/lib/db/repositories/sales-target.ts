import { prisma } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";
import { ownerWhere } from "@/lib/auth/scope";

/**
 * 业绩目标与配额看板（#68）。
 * 目标挂用户 × 月份（YYYY-MM）；看板按权限展示每个负责人的当月完成率，
 * 完成额取当月赢单商机金额（与销售分析同源，按 Opportunity.ownerId 收窄）。
 */

/** 当前月份的 YYYY-MM 键。 */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** 读取指定月份的目标（按权限：管理员全部，负责人仅自己）。 */
export async function listSalesTargets(user: CurrentUser, month: string) {
  const scope = ownerWhere({ userId: user.id, role: user.role }) as {
    ownerId?: string;
  };
  return prisma.salesTarget.findMany({
    where: {
      month,
      ...(scope.ownerId ? { userId: scope.ownerId } : {}),
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { amount: "desc" },
  });
}

/** 管理员为目标用户设置某月目标；upsert 保证一人一月一条。 */
export async function setSalesTarget(
  userId: string,
  month: string,
  amount: number,
  note: string | null
) {
  return prisma.salesTarget.upsert({
    where: { userId_month: { userId, month } },
    create: { userId, month, amount, note },
    update: { amount, note },
  });
}

/** 看板：每个目标用户的当月完成率（完成额 = 当月赢单商机金额）。 */
export async function loadTargetBoard(user: CurrentUser, month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const from = new Date(year, monthNum - 1, 1);
  const to = new Date(year, monthNum, 1); // 下月 1 日，左闭右开
  const [targets, wonRows] = await Promise.all([
    listSalesTargets(user, month),
    prisma.opportunity.findMany({
      where: {
        ...ownerWhere({ userId: user.id, role: user.role }),
        stage: "WON",
        createdAt: { gte: from, lt: to },
      },
      select: { ownerId: true, amount: true },
    }),
  ]);

  const achievedByUser = new Map<string, number>();
  for (const row of wonRows) {
    if (!row.ownerId) continue;
    achievedByUser.set(
      row.ownerId,
      (achievedByUser.get(row.ownerId) ?? 0) + (row.amount ?? 0)
    );
  }

  return targets.map((target) => {
    const achieved = achievedByUser.get(target.userId) ?? 0;
    const rate =
      target.amount > 0
        ? Math.round((achieved / target.amount) * 1000) / 10
        : 0;
    return {
      userId: target.userId,
      userName: target.user.name,
      target: target.amount,
      achieved,
      rate,
    };
  });
}
