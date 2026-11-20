import { prisma } from "../client";
import { ownerWhere, type AccessScope } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
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

/** 普通负责人可见的跟进记录：关联到本人客户或本人商机。 */
function followUpScopeWhere(user: CurrentUser): Prisma.FollowUpWhereInput {
  if (user.role === "ADMIN") return {};
  return {
    OR: [
      { customer: { ownerId: user.id } },
      { opportunity: { ownerId: user.id } },
    ],
  };
}

/** 把权限条件与列表筛选合并为 Prisma where。 */
function combineFollowUpWhere(
  scope: Prisma.FollowUpWhereInput,
  filters: Prisma.FollowUpWhereInput[]
): Prisma.FollowUpWhereInput {
  const all = [...filters];
  if (Object.keys(scope).length > 0) {
    all.push(scope);
  }
  if (all.length === 0) return {};
  if (all.length === 1) return all[0];
  return { AND: all };
}

/** 从 create 入参中提取关联客户/商机 ID；不读取客户端传入的 owner。 */
function followUpRelationIds(
  data: Prisma.FollowUpCreateInput | Prisma.FollowUpUncheckedCreateInput
) {
  const asChecked = data as Prisma.FollowUpCreateInput;
  const asUnchecked = data as Prisma.FollowUpUncheckedCreateInput;
  return {
    customerId:
      asUnchecked.customerId ?? asChecked.customer?.connect?.id ?? null,
    opportunityId:
      asUnchecked.opportunityId ?? asChecked.opportunity?.connect?.id ?? null,
  };
}

/**
 * 校验待创建跟进记录关联的客户/商机属于当前会话负责人。
 * 管理员不受限制；普通负责人至少需要一个本人可访问的关联对象。
 */
async function assertFollowUpCreationScope(
  data: Prisma.FollowUpCreateInput | Prisma.FollowUpUncheckedCreateInput,
  user: CurrentUser
): Promise<void> {
  if (user.role === "ADMIN") return;

  const { customerId, opportunityId } = followUpRelationIds(data);
  if (!customerId && !opportunityId) {
    throw new Error("跟进记录必须关联本人负责的客户或商机");
  }

  const [customer, opportunity] = await Promise.all([
    customerId
      ? prisma.customer.findFirst({
          where: { id: customerId, ownerId: user.id },
          select: { id: true },
        })
      : Promise.resolve(null),
    opportunityId
      ? prisma.opportunity.findFirst({
          where: { id: opportunityId, ownerId: user.id },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!customer && !opportunity) {
    throw new Error("无权在该客户或商机下创建跟进记录");
  }
}

/** 查询跟进记录列表（含客户、商机、跟进人）。 */
export async function listFollowUps(
  params: { customerId?: string; opportunityId?: string } = {},
  user: CurrentUser
): Promise<FollowUp[]> {
  const filters: Prisma.FollowUpWhereInput[] = [];
  if (params.customerId || params.opportunityId) {
    const relationFilter: Prisma.FollowUpWhereInput = {
      OR: [
        ...(params.customerId ? [{ customerId: params.customerId }] : []),
        ...(params.opportunityId
          ? [{ opportunityId: params.opportunityId }]
          : []),
      ],
    };
    filters.push(relationFilter);
  }
  return prisma.followUp.findMany({
    where: combineFollowUpWhere(followUpScopeWhere(user), filters),
    include: { customer: true, opportunity: true, owner: true },
    orderBy: { createdAt: "desc" },
  });
}

/** 按 ID 查询当前会话可见的跟进记录详情。 */
export async function getFollowUp(
  id: string,
  user: CurrentUser
): Promise<FollowUp | null> {
  return prisma.followUp.findFirst({
    where: combineFollowUpWhere(followUpScopeWhere(user), [{ id }]),
    include: { customer: true, opportunity: true, owner: true },
  });
}

/**
 * 创建跟进记录。
 * 普通负责人只能关联本人客户/商机，归属人强制取当前会话，不能由表单伪造。
 */
export async function createFollowUp(
  data: Prisma.FollowUpCreateInput,
  user: CurrentUser
): Promise<FollowUp> {
  await assertFollowUpCreationScope(data, user);

  const { owner: _ignoredOwner, ...rest } = data;
  const nextData: Prisma.FollowUpUncheckedCreateInput = {
    ...(rest as Prisma.FollowUpUncheckedCreateInput),
    ownerId: user.id,
  };
  return prisma.followUp.create({ data: nextData });
}

/** 更新当前会话可见的跟进记录；归属人不可被改写。 */
export async function updateFollowUp(
  id: string,
  data: Prisma.FollowUpUpdateInput,
  user: CurrentUser
): Promise<FollowUp | null> {
  const {
    owner: _ignoredOwner,
    ownerId: _ignoredOwnerId,
    ...rest
  } = data as Prisma.FollowUpUpdateInput & { ownerId?: never };
  const result = await prisma.followUp.updateMany({
    where: combineFollowUpWhere(followUpScopeWhere(user), [{ id }]),
    data: rest,
  });
  if (result.count === 0) return null;
  return prisma.followUp.findFirst({
    where: combineFollowUpWhere(followUpScopeWhere(user), [{ id }]),
    include: { customer: true, opportunity: true, owner: true },
  });
}

/** 删除当前会话可见的跟进记录，越权或不存在时返回 false。 */
export async function deleteFollowUp(
  id: string,
  user: CurrentUser
): Promise<FollowUp | boolean> {
  if (user.role === "ADMIN") {
    try {
      return await prisma.followUp.delete({ where: { id } });
    } catch {
      return false;
    }
  }

  const result = await prisma.followUp.deleteMany({
    where: combineFollowUpWhere(followUpScopeWhere(user), [{ id }]),
  });
  return result.count > 0;
}

/** 统计当前会话可见的跟进记录数量。 */
export async function countFollowUps(user: CurrentUser): Promise<number> {
  const where = followUpScopeWhere(user);
  return Object.keys(where).length === 0
    ? prisma.followUp.count()
    : prisma.followUp.count({ where });
}
