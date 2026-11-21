import { CustomerLifecycle } from "@/generated/prisma/enums";

/** 客户生命周期阶段的中文展示名。 */
export const customerLifecycleLabel: Record<CustomerLifecycle, string> = {
  [CustomerLifecycle.LEAD]: "线索",
  [CustomerLifecycle.WON]: "成交",
  [CustomerLifecycle.RETAINED]: "留存",
  [CustomerLifecycle.CHURNED]: "流失",
};
