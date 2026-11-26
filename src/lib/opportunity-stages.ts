import { OpportunityStage } from "@/generated/prisma/enums";

/** 销售阶段在漏斗与商机列表中的统一展示信息，顺序即漏斗顺序。 */
export const OPPORTUNITY_STAGES = [
  { value: OpportunityStage.CONTACT, label: "已建立联系", tone: "blue" },
  { value: OpportunityStage.NEED_CONFIRM, label: "需求确认", tone: "blue" },
  { value: OpportunityStage.QUOTE, label: "报价", tone: "amber" },
  { value: OpportunityStage.NEGOTIATE, label: "谈判", tone: "blue" },
  { value: OpportunityStage.WON, label: "赢单", tone: "green" },
  { value: OpportunityStage.LOST, label: "输单", tone: "zinc" },
] as const;

export type StageTone = (typeof OPPORTUNITY_STAGES)[number]["tone"];

/** 合法的销售阶段值集合。 */
const stageValues = new Set<string>(
  OPPORTUNITY_STAGES.map((stage) => stage.value)
);

/** 把查询参数解析为合法销售阶段；非法值返回 null。 */
export function parseOpportunityStage(
  value: string | string[] | undefined
): OpportunityStage | null {
  if (typeof value !== "string" || !stageValues.has(value)) return null;
  return value as OpportunityStage;
}
