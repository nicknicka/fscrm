import type { CurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  countLeads,
  countLeadsForPage,
  countOpportunities,
  countOpportunitiesForPage,
  getOpportunity,
  listLeads,
  listOpportunities,
} from "@/lib/db/repositories/sales";

/**
 * 商机页面的服务端读取接缝：页面只依赖这里提供的会话范围数据，
 * 不直接调用全局 Prisma 查询；写权限仍由每个 Server Action 独立校验。
 *
 * 目前这里是对仓储函数的薄封装，保留它使页面与仓储签名解耦；若商机读取
 * 规则后续收敛（#17），只需改这一处。
 */

export type OpportunityListFilters = {
  stage?: string;
  ownerId?: string;
  search?: string;
};

export async function listOpportunitiesForCurrentUser(
  scope: CurrentUser,
  filters: OpportunityListFilters = {},
  pagination: { skip?: number; take?: number } = {}
) {
  return listOpportunities({ ...filters, ...pagination }, scope);
}

/** 商机分页计数：与列表共用同一套筛选与权限口径。 */
export async function countOpportunitiesForCurrentUser(
  scope: CurrentUser,
  filters: OpportunityListFilters = {}
) {
  return countOpportunitiesForPage(filters, scope);
}

export async function getOpportunityForCurrentUser(
  id: string,
  scope: CurrentUser
) {
  return getOpportunity(id, scope);
}

/**
 * 线索视图的读取接缝：商机页把「未谈的线索」和「在谈的商机」放在同一张
 * 列表里切换，线索走这里读取，权限口径仍与 /leads 页面完全一致。
 */
export type LeadListFilters = {
  status?: string;
  ownerId?: string;
  search?: string;
};

export async function listLeadsForCurrentUser(
  scope: CurrentUser,
  filters: LeadListFilters = {},
  pagination: { skip?: number; take?: number } = {}
) {
  return listLeads({ ...filters, ...pagination }, accessScopeFor(scope));
}

export async function countLeadsForCurrentUser(
  scope: CurrentUser,
  filters: LeadListFilters = {}
) {
  return countLeadsForPage(filters, accessScopeFor(scope));
}

/**
 * 线索总数：视图切换条两个视图都要显示数量，所以商机视图也要读。
 * 不带搜索条件——切换条上的数字是「库里有多少」，不随筛选变化。
 */
export async function countAllLeadsForCurrentUser(scope: CurrentUser) {
  return countLeads(accessScopeFor(scope));
}

/** 商机总数，用途同 countAllLeadsForCurrentUser：切换条的固定基数。 */
export async function countAllOpportunitiesForCurrentUser(scope: CurrentUser) {
  return countOpportunities(scope);
}
