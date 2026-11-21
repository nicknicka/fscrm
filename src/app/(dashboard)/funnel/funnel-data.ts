import { requireCurrentUser } from "@/lib/auth/session";
import { countOpportunitiesByStage } from "@/lib/db/repositories/sales";
import { OPPORTUNITY_STAGES } from "@/lib/opportunity-stages";

/**
 * 销售漏斗的页面数据接缝：从会话确定权限范围，实时聚合商机阶段计数，
 * 并为每个阶段生成下钻到商机列表的链接。
 */
export async function loadFunnelData() {
  const currentUser = await requireCurrentUser();
  const grouped = await countOpportunitiesByStage(currentUser);
  const counts = new Map(grouped.map((row) => [row.stage, row.count]));

  const stages = OPPORTUNITY_STAGES.map(({ value, label, tone }) => ({
    stage: value,
    label,
    tone,
    count: counts.get(value) ?? 0,
    href: `/opportunities?stage=${value}`,
  }));

  return {
    stages,
    total: stages.reduce((sum, stage) => sum + stage.count, 0),
  };
}
