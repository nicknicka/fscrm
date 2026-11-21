import type { CurrentUser } from "@/lib/auth/session";
import { getOpportunity, listOpportunities } from "@/lib/db/repositories/sales";

/**
 * 商机页面的服务端读取接缝：页面只依赖这里提供的会话范围数据，
 * 不直接调用全局 Prisma 查询；写权限仍由每个 Server Action 独立校验。
 *
 * 目前这里是对仓储函数的薄封装，保留它使页面与仓储签名解耦；若商机读取
 * 规则后续收敛（#17），只需改这一处。
 */

export async function listOpportunitiesForCurrentUser(
  scope: CurrentUser,
  filters: { stage?: string } = {}
) {
  return listOpportunities(filters, scope);
}

export async function getOpportunityForCurrentUser(
  id: string,
  scope: CurrentUser
) {
  return getOpportunity(id, scope);
}

