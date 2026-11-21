import { CustomerLifecycle } from "@/generated/prisma/enums";

/**
 * 客户生命周期阶段是**人工维护**的标签，由负责人显式修改。
 * 它不会由 Lead.status 或 Opportunity.stage 自动派生：线索流失、商机赢单
 * 都不会自动改写客户生命周期，保持「人工推进 + 可解释」的语义。
 */

/** 客户生命周期阶段的中文展示名。 */
export const customerLifecycleLabel: Record<CustomerLifecycle, string> = {
  [CustomerLifecycle.LEAD]: "线索",
  [CustomerLifecycle.WON]: "成交",
  [CustomerLifecycle.RETAINED]: "留存",
  [CustomerLifecycle.CHURNED]: "流失",
};
