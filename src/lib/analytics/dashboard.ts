import { prisma } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";
import { ownerWhere } from "@/lib/auth/scope";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";
import { countOpportunitiesByStage } from "@/lib/db/repositories/sales";
import { listStageConfigs } from "@/lib/db/repositories/stage-config";
import { CustomerLevel } from "@/generated/prisma/enums";

/**
 * 销售分析的数据层：所有视图都按当前用户权限实时聚合，
 * 与列表页口径一致（商机按 Opportunity.ownerId，客户按客户负责人）。
 */
export interface StageDatum {
  stage: string;
  label: string;
  count: number;
}

export interface TrendDatum {
  month: string;
  count: number;
  amount: number;
}

export interface LevelDatum {
  level: string;
  label: string;
  count: number;
}

/** 赢单率（金额口径）：赢单金额 / 全部商机金额。 */
export interface WinRateDatum {
  wonAmount: number;
  totalAmount: number;
  wonCount: number;
  totalCount: number;
  /** 百分比数值（0-100），保留一位小数；无商机时为 0。 */
  rate: number;
}

const LEVEL_LABELS: Record<CustomerLevel, string> = {
  [CustomerLevel.HIGH]: "高价值",
  [CustomerLevel.MEDIUM]: "中价值",
  [CustomerLevel.LOW]: "低价值",
};

/** 阶段分布：直接复用漏斗的聚合函数，保证与漏斗数字一致。 */
export async function loadStageDistribution(
  user: CurrentUser
): Promise<StageDatum[]> {
  const [grouped, configs] = await Promise.all([
    countOpportunitiesByStage(user),
    listStageConfigs(),
  ]);
  const counts = new Map(grouped.map((row) => [row.stage, row.count]));
  const stages = configs.length > 0 ? configs : OPPORTUNITY_STAGES;
  return stages.map(({ value, label }) => ({
    stage: value,
    label,
    count: counts.get(value) ?? 0,
  }));
}

/** 近 N 个月商机趋势：按月统计数量与预计金额（按创建月份归档）。 */
export async function loadOpportunityTrend(
  user: CurrentUser,
  months = 6
): Promise<TrendDatum[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.opportunity.findMany({
    where: {
      ...ownerWhere({ userId: user.id, role: user.role }),
      createdAt: { gte: since },
    },
    select: { createdAt: true, amount: true },
  });

  const buckets = new Map<string, TrendDatum>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { month: key, count: 0, amount: 0 });
  }
  for (const row of rows) {
    const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.amount += row.amount ?? 0;
  }
  return Array.from(buckets.values());
}

/** 客户等级分布：按当前权限收窄后 groupBy。 */
export async function loadCustomerLevelDistribution(
  user: CurrentUser
): Promise<LevelDatum[]> {
  const groups = await prisma.customer.groupBy({
    by: ["level"],
    where: ownerWhere({ userId: user.id, role: user.role }),
    _count: { _all: true },
  });
  return groups.map((group) => ({
    level: group.level,
    label: LEVEL_LABELS[group.level] ?? group.level,
    count: group._count._all,
  }));
}

/**
 * 赢单率（金额口径）：赢单商机金额 / 全部商机金额，按当前权限收窄。
 * 金额为空的商机按 0 计入总数，不影响分母的商机条数统计。
 */
export async function loadWinRate(user: CurrentUser): Promise<WinRateDatum> {
  const rows = await prisma.opportunity.findMany({
    where: ownerWhere({ userId: user.id, role: user.role }),
    select: { stage: true, amount: true },
  });
  const won = rows.filter((row) => row.stage === "WON");
  const wonAmount = won.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const totalAmount = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return {
    wonAmount,
    totalAmount,
    wonCount: won.length,
    totalCount: rows.length,
    rate:
      totalAmount > 0 ? Math.round((wonAmount / totalAmount) * 1000) / 10 : 0,
  };
}
