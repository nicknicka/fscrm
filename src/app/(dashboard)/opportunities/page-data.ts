import type { CurrentUser } from "@/lib/auth/session";
import {
  loadOpportunityFormCustomers,
  loadOpportunityFormUsers,
} from "./form-options";
import { parseOpportunityStage } from "@/lib/opportunity-stages";
import {
  countOpportunitiesForCurrentUser,
  listOpportunitiesForCurrentUser,
  type OpportunityListFilters,
} from "./scope";

/** 商机列表页面数据：按当前会话范围读取商机，支持阶段/负责人/关键词筛选与分页。 */
export async function loadOpportunitiesPageData(
  user: CurrentUser,
  input: {
    stage?: string | string[] | null;
    ownerId?: string | string[] | null;
    q?: string | string[] | null;
  } = {},
  pagination: { skip?: number; take?: number } = {}
) {
  const parsedStage = parseOpportunityStage(input.stage ?? undefined);
  const filters: OpportunityListFilters = {
    ...(parsedStage ? { stage: parsedStage } : {}),
    ...(typeof input.ownerId === "string" && input.ownerId
      ? { ownerId: input.ownerId }
      : {}),
    ...(typeof input.q === "string" && input.q ? { search: input.q } : {}),
  };
  const [opportunities, total, customers, users] = await Promise.all([
    listOpportunitiesForCurrentUser(user, filters, pagination),
    countOpportunitiesForCurrentUser(user, filters),
    loadOpportunityFormCustomers(user),
    loadOpportunityFormUsers(user),
  ]);
  return { opportunities, total, customers, users, filters };
}
