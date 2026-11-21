import type { CurrentUser } from "@/lib/auth/session";
import {
  loadOpportunityFormCustomers,
  loadOpportunityFormUsers,
} from "./form-options";
import { parseOpportunityStage } from "@/lib/opportunity-stages";
import { listOpportunitiesForCurrentUser } from "./scope";

/** 商机列表页面数据：按当前会话范围读取商机，并支持合法销售阶段筛选。 */
export async function loadOpportunitiesPageData(
  user: CurrentUser,
  stage: string | string[] | null | undefined
) {
  const parsedStage = parseOpportunityStage(stage ?? undefined);
  const filters = parsedStage ? { stage: parsedStage } : {};
  const [opportunities, customers, users] = await Promise.all([
    listOpportunitiesForCurrentUser(user, filters),
    loadOpportunityFormCustomers(user),
    loadOpportunityFormUsers(user),
  ]);
  return { opportunities, customers, users };
}
