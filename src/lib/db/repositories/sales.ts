import { prisma } from "../client";
import type {
  FollowUp,
  Lead,
  Opportunity,
  Prisma,
} from "../../../generated/prisma/client";

/**
 * 线索、商机、跟进记录的数据访问层。
 */

// ---------------------------------------------------------------------------
// 线索
// ---------------------------------------------------------------------------

/** 查询线索列表（含负责人）。 */
export async function listLeads(
  params: { status?: string; ownerId?: string } = {}
) {
  const where: Prisma.LeadWhereInput = {};
  if (params.status) {
    where.status = params.status as Prisma.LeadWhereInput["status"];
  }
  if (params.ownerId) {
    where.ownerId = params.ownerId;
  }
  return prisma.lead.findMany({
    where,
    include: { owner: true },
    orderBy: { createdAt: "desc" },
  });
}

/** 创建线索。 */
export async function createLead(data: Prisma.LeadCreateInput): Promise<Lead> {
  return prisma.lead.create({ data });
}

/** 更新线索。 */
export async function updateLead(
  id: string,
  data: Prisma.LeadUpdateInput
): Promise<Lead> {
  return prisma.lead.update({ where: { id }, data });
}

/** 删除线索。 */
export async function deleteLead(id: string): Promise<Lead> {
  return prisma.lead.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// 商机
// ---------------------------------------------------------------------------

/** 查询商机列表（含客户与负责人）。 */
export async function listOpportunities(
  params: { stage?: string; customerId?: string } = {}
) {
  const where: Prisma.OpportunityWhereInput = {};
  if (params.stage) {
    where.stage = params.stage as Prisma.OpportunityWhereInput["stage"];
  }
  if (params.customerId) {
    where.customerId = params.customerId;
  }
  return prisma.opportunity.findMany({
    where,
    include: { customer: true, owner: true },
    orderBy: { createdAt: "desc" },
  });
}

/** 创建商机。 */
export async function createOpportunity(
  data: Prisma.OpportunityCreateInput
): Promise<Opportunity> {
  return prisma.opportunity.create({ data });
}

/** 更新商机（如推进销售阶段）。 */
export async function updateOpportunity(
  id: string,
  data: Prisma.OpportunityUpdateInput
): Promise<Opportunity> {
  return prisma.opportunity.update({ where: { id }, data });
}

/** 删除商机。 */
export async function deleteOpportunity(id: string): Promise<Opportunity> {
  return prisma.opportunity.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// 跟进记录
// ---------------------------------------------------------------------------

/** 查询跟进记录列表（含客户、商机、跟进人）。 */
export async function listFollowUps(
  params: { customerId?: string; opportunityId?: string } = {}
): Promise<FollowUp[]> {
  const where: Prisma.FollowUpWhereInput = {};
  if (params.customerId) {
    where.customerId = params.customerId;
  }
  if (params.opportunityId) {
    where.opportunityId = params.opportunityId;
  }
  return prisma.followUp.findMany({
    where,
    include: { customer: true, opportunity: true, owner: true },
    orderBy: { createdAt: "desc" },
  });
}

/** 创建跟进记录。 */
export async function createFollowUp(
  data: Prisma.FollowUpCreateInput
): Promise<FollowUp> {
  return prisma.followUp.create({ data });
}

/** 删除跟进记录。 */
export async function deleteFollowUp(id: string): Promise<FollowUp> {
  return prisma.followUp.delete({ where: { id } });
}
