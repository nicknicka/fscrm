import { prisma } from "../client";
import { ownerWhere, type AccessScope } from "@/lib/auth/scope";
import type {
  FollowUp,
  Lead,
  Opportunity,
  Prisma,
} from "../../../generated/prisma/client";

/**
 * 线索、商机、跟进记录的数据访问层。
 */

/** 权限不足或对象不存在时统一返回该错误，避免泄露对象是否存在。 */
export class BusinessObjectNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "BusinessObjectNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// 线索
// ---------------------------------------------------------------------------

/** 查询线索列表（含负责人）。 */
export async function listLeads(
  params: { status?: string; ownerId?: string },
  scope: AccessScope
) {
  const where: Prisma.LeadWhereInput = { ...ownerWhere(scope) };
  if (params.status) {
    where.status = params.status as Prisma.LeadWhereInput["status"];
  }
  if (params.ownerId && scope.role === "ADMIN") {
    where.ownerId = params.ownerId;
  }
  return prisma.lead.findMany({
    where,
    include: { owner: true },
    orderBy: { createdAt: "desc" },
  });
}

/** 统计当前权限范围内的线索数。 */
export async function countLeads(scope: AccessScope): Promise<number> {
  return prisma.lead.count({ where: ownerWhere(scope) });
}

/** 创建线索。普通负责人创建的线索归属本人，管理员可指定负责人。 */
export async function createLead(
  data: Prisma.LeadCreateInput,
  scope: AccessScope
): Promise<Lead> {
  const owner = ownerWhere(scope) as { ownerId?: string };
  return prisma.lead.create({
    data: owner.ownerId
      ? { ...data, owner: { connect: { id: owner.ownerId } } }
      : data,
  });
}

/** 更新当前权限范围内的线索。 */
export async function updateLead(
  id: string,
  data: Prisma.LeadUpdateInput,
  scope: AccessScope
): Promise<Lead> {
  const owner = ownerWhere(scope) as { ownerId?: string };
  const result = await prisma.lead.updateMany({
    where: owner.ownerId ? { id, ownerId: owner.ownerId } : { id },
    data,
  });
  if (result.count === 0) {
    throw new BusinessObjectNotFoundError();
  }
  return prisma.lead.findUniqueOrThrow({ where: { id } });
}

/** 删除当前权限范围内的线索。 */
export async function deleteLead(
  id: string,
  scope: AccessScope
): Promise<Lead> {
  const owner = ownerWhere(scope) as { ownerId?: string };
  const where = owner.ownerId ? { id, ownerId: owner.ownerId } : { id };
  const lead = await prisma.lead.findFirst({ where });
  if (!lead) {
    throw new BusinessObjectNotFoundError();
  }
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
