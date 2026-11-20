import { prisma } from "../client";
import type { CurrentUser } from "../../auth/session";
import type {
  FollowUp,
  Lead,
  Opportunity,
  Prisma,
} from "../../../generated/prisma/client";

/**
 * 线索、商机、跟进记录的数据访问层。
 *
 * 商机相关查询与写入都接收当前负责人与角色：管理员可处理全部商机，
 * 普通负责人只能处理自己负责的商机；越权更新/删除表现为“记录不存在”。
 */

/** 把仓储层的 P2025 转换为不泄露对象存在性的拒绝结果。 */
function rejectMissingRecord(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  ) {
    throw new Error("FORBIDDEN");
  }
  throw error;
}

function opportunityWhere(
  scope: CurrentUser,
  params: { stage?: string; customerId?: string; ownerId?: string } = {}
): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = {};
  if (params.stage) {
    where.stage = params.stage as Prisma.OpportunityWhereInput["stage"];
  }
  if (params.customerId && scope.role === "ADMIN") {
    where.customerId = params.customerId;
  }
  if (scope.role === "OWNER") {
    where.ownerId = scope.id;
    if (params.customerId) {
      where.customerId = params.customerId;
    }
  } else if (params.ownerId) {
    where.ownerId = params.ownerId;
  }
  return where;
}

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

/** 查询商机列表（含客户与负责人），按当前负责人角色收窄。 */
export async function listOpportunities(
  params: { stage?: string; customerId?: string; ownerId?: string } = {},
  scope: CurrentUser
) {
  return prisma.opportunity.findMany({
    where: opportunityWhere(scope, params),
    include: { customer: true, owner: true },
    orderBy: { createdAt: "desc" },
  });
}

/** 按 ID 查询商机详情；无权限或不存在时返回 null。 */
export async function getOpportunity(id: string, scope: CurrentUser) {
  const where: Prisma.OpportunityWhereInput = { id };
  if (scope.role === "OWNER") {
    where.ownerId = scope.id;
  }
  return prisma.opportunity.findFirst({
    where,
    include: {
      customer: true,
      owner: true,
      followUps: { include: { owner: true }, orderBy: { createdAt: "desc" } },
    },
  });
}

/** 创建商机：普通负责人归属本人，且只能关联自己负责的客户。 */
export async function createOpportunity(
  data: Prisma.OpportunityCreateInput,
  scope: CurrentUser
): Promise<Opportunity> {
  const customerId = data.customer.connect?.id;
  if (!customerId) {
    throw new Error("FORBIDDEN");
  }

  const payload: Prisma.OpportunityCreateInput = { ...data };
  if (scope.role === "OWNER") {
    const customerWhere: Prisma.CustomerWhereInput = {
      id: customerId,
      ownerId: scope.id,
    };
    const customer = await prisma.customer.findFirst({
      where: customerWhere,
      select: { id: true },
    });
    if (!customer) {
      throw new Error("FORBIDDEN");
    }
    payload.owner = { connect: { id: scope.id } };
  }

  return prisma.opportunity.create({ data: payload });
}

/** 更新商机（如推进销售阶段或移交负责人）。 */
export async function updateOpportunity(
  id: string,
  data: Prisma.OpportunityUpdateInput,
  scope: CurrentUser
): Promise<Opportunity> {
  const where = { id };
  if (scope.role === "OWNER") {
    Object.assign(where, { ownerId: scope.id });
    if ("owner" in data) {
      throw new Error("FORBIDDEN");
    }
  }
  try {
    return await prisma.opportunity.update({ where, data });
  } catch (error) {
    rejectMissingRecord(error);
  }
}

/** 删除商机；无权限或不存在时返回拒绝结果。 */
export async function deleteOpportunity(
  id: string,
  scope: CurrentUser
): Promise<Opportunity> {
  const where = { id };
  if (scope.role === "OWNER") {
    Object.assign(where, { ownerId: scope.id });
  }
  try {
    return await prisma.opportunity.delete({ where });
  } catch (error) {
    rejectMissingRecord(error);
  }
}

/** 统计当前权限范围内可见的商机数量。 */
export async function countOpportunities(scope: CurrentUser): Promise<number> {
  return prisma.opportunity.count({
    where: scope.role === "OWNER" ? { ownerId: scope.id } : {},
  });
}

/** 商机表单可选的负责人：普通负责人仅本人，管理员可移交。 */
export async function listAssignableOpportunityOwners(scope: CurrentUser) {
  return prisma.user.findMany({
    where: scope.role === "OWNER" ? { id: scope.id } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
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
