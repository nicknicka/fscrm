import { requireCurrentUser } from "@/lib/auth/session";
import { countOpportunitiesByStage } from "@/lib/db/repositories/sales";
import { listStageConfigs } from "@/lib/db/repositories/stage-config";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";

/**
 * 销售漏斗的页面数据接缝：从会话确定权限范围，实时聚合商机阶段计数，
 * 并为每个阶段生成下钻到商机列表的链接。
 *
 * 范围口径：普通负责人的漏斗计数与下钻列表都按 `Opportunity.ownerId` 过滤，
 * 两边一致；这与单据类对象按客户负责人收窄的口径有意不同（漏斗以商机归属为准）。
 */
export async function loadFunnelData() {
  const currentUser = await requireCurrentUser();
  const [grouped, configs] = await Promise.all([
    countOpportunitiesByStage(currentUser),
    listStageConfigs(),
  ]);
  const counts = new Map(grouped.map((row) => [row.stage, row.count]));
  const stages = (configs.length > 0 ? configs : OPPORTUNITY_STAGES).map(
    ({ value, label, tone }) => ({
      stage: value,
      label,
      tone,
      count: counts.get(value) ?? 0,
      href: `/opportunities?stage=${value}`,
    })
  );

  return {
    stages,
    total: stages.reduce((sum, stage) => sum + stage.count, 0),
  };
}
