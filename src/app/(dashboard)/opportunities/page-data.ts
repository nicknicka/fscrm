import type { CurrentUser } from "@/lib/auth/session";
import {
  loadOpportunityFormCustomers,
  loadOpportunityFormUsers,
} from "./form-options";
import { parseOpportunityStage } from "@/lib/opportunity-stages";
import {
  countAllLeadsForCurrentUser,
  countAllOpportunitiesForCurrentUser,
  countLeadsForCurrentUser,
  countOpportunitiesForCurrentUser,
  listLeadsForCurrentUser,
  listOpportunitiesForCurrentUser,
  type OpportunityListFilters,
} from "./scope";

/**
 * 商机列表的两种视图。
 *
 * 「商机」= 已经在谈（已挂客户）；「线索」= 还没谈（未挂客户）。
 * 两者共用同一张列表和同一套筛选，用 `view` 切换，避免用户在两页对照着猜。
 */
export type PipelineView = "opportunities" | "leads";

export function parsePipelineView(value: unknown): PipelineView {
  return value === "leads" ? "leads" : "opportunities";
}

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

/**
 * 线索视图的数据：同样支持负责人/关键词筛选与分页。
 *
 * 阶段筛选对线索无意义（线索没有销售阶段），所以这里不接 stage，
 * 页面切到线索视图时也会把 stage 从查询串里去掉，避免两套筛选互相干扰。
 */
export async function loadLeadsPageData(
  user: CurrentUser,
  input: {
    ownerId?: string | string[] | null;
    q?: string | string[] | null;
  } = {},
  pagination: { skip?: number; take?: number } = {}
) {
  const filters = {
    ...(typeof input.ownerId === "string" && input.ownerId
      ? { ownerId: input.ownerId }
      : {}),
    ...(typeof input.q === "string" && input.q ? { search: input.q } : {}),
  };
  const [leads, total] = await Promise.all([
    listLeadsForCurrentUser(user, filters, pagination),
    countLeadsForCurrentUser(user, filters),
  ]);
  return { leads, total, filters };
}

/**
 * 视图切换条上两个固定计数。
 *
 * 不随搜索/负责人筛选变化，也不受当前视图影响——它回答的是
 * 「这条动线上，未谈的和在谈的各有多少」，是导航性质的信息。
 */
export async function loadPipelineCounts(user: CurrentUser) {
  const [opportunities, leads] = await Promise.all([
    countAllOpportunitiesForCurrentUser(user),
    countAllLeadsForCurrentUser(user),
  ]);
  return { opportunities, leads };
}
