import { requireCurrentUser } from "@/lib/auth/session";
import { loadWinRate } from "@/lib/analytics/dashboard";
import { countOpportunitiesByStage } from "@/lib/db/repositories/sales";
import { listStageConfigs } from "@/lib/db/repositories/stage-config";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";

/** 漏斗单阶段的转化率（占进入漏斗的商机数）。 */
export interface FunnelStageConversion {
  stage: string;
  label: string;
  count: number;
  amount: number;
  rate: number;
}

/**
 * 销售漏斗的页面数据接缝：从会话确定权限范围，实时聚合商机阶段计数，
 * 并为每个阶段生成下钻到商机列表的链接。
 *
 * 范围口径：普通负责人的漏斗计数与下钻列表都按 `Opportunity.ownerId` 过滤，
 * 两边一致；这与单据类对象按客户负责人收窄的口径有意不同（漏斗以商机归属为准）。
 */
export async function loadFunnelData() {
  const currentUser = await requireCurrentUser();
  const [grouped, configs, winRate] = await Promise.all([
    countOpportunitiesByStage(currentUser),
    listStageConfigs(),
    loadWinRate(currentUser),
  ]);
  const counts = new Map(grouped.map((row) => [row.stage, row.count]));
  const amounts = new Map(grouped.map((row) => [row.stage, row.amount]));
  const stageConfigs = configs.length > 0 ? configs : OPPORTUNITY_STAGES;
  const stages = stageConfigs.map(({ value, label, tone }) => ({
    stage: value,
    label,
    tone,
    count: counts.get(value) ?? 0,
    amount: amounts.get(value) ?? 0,
    href: `/opportunities?stage=${value}`,
  }));

  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  // 阶段转化率：各阶段商机数 / 漏斗内总商机数，保留一位小数。
  // 与下方阶段条共用同一组计数口径（均来自 countOpportunitiesByStage）。
  const stageConversions: FunnelStageConversion[] = stageConfigs
    .filter(({ value }) => value !== "WON" && value !== "LOST")
    .map(({ value, label }) => {
      const count = counts.get(value) ?? 0;
      return {
        stage: value,
        label,
        count,
        amount: amounts.get(value) ?? 0,
        rate: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });

  return {
    stages,
    total,
    summary: {
      winRate,
      stageConversions,
    },
  };
}
