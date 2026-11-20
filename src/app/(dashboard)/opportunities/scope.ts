import type { CurrentUser } from "@/lib/auth/session";
import { getOpportunity, listOpportunities } from "@/lib/db/repositories/sales";

/**
 * 商机页面的服务端读取接缝：页面只依赖这里提供的会话范围数据，
 * 不直接调用全局 Prisma 查询；写权限仍由每个 Server Action 独立校验。
 */

export async function listOpportunitiesForCurrentUser(scope: CurrentUser) {
  return listOpportunities({}, scope);
}

export async function getOpportunityForCurrentUser(
  id: string,
  scope: CurrentUser
) {
  return getOpportunity(id, scope);
}

