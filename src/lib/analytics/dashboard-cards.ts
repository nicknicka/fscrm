/** 仪表盘可配置卡片的目录（无运行时依赖，服务端与组件共用）。 */

export const DASHBOARD_CARDS = [
  "stat_customers",
  "stat_leads",
  "stat_opportunities",
  "stat_followups",
  "chart_stage",
  "chart_level",
  "chart_trend",
] as const;

export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

export const CARD_LABELS: Record<DashboardCard, string> = {
  stat_customers: "客户数",
  stat_leads: "线索数",
  stat_opportunities: "商机数",
  stat_followups: "跟进记录数",
  chart_stage: "阶段分布图",
  chart_level: "客户等级图",
  chart_trend: "商机趋势图",
};

export const DEFAULT_CARDS: readonly DashboardCard[] = DASHBOARD_CARDS;

export function isDashboardCard(value: string): value is DashboardCard {
  return (DASHBOARD_CARDS as readonly string[]).includes(value);
}

/** 把存储值规整为合法卡片 key 的有序列表；过滤非法值、去重、保序。 */
export function normalizeCards(value: unknown): DashboardCard[] {
  if (!Array.isArray(value)) return [...DEFAULT_CARDS];
  const seen = new Set<string>();
  const result: DashboardCard[] = [];
  for (const item of value) {
    if (typeof item === "string" && isDashboardCard(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result.length > 0 ? result : [...DEFAULT_CARDS];
}
