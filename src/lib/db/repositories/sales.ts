import { prisma } from "../client";
import { ownerWhere, type AccessScope } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
import { BusinessObjectNotFoundError } from "./not-found";

// 商机、线索与跟进记录沿用的统一越权/不存在错误，实体定义在 ./not-found。
export { BusinessObjectNotFoundError };
import type {
  FollowUp,
  Lead,
  Opportunity,
  OpportunityStage,
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
  params: {
    stage?: string;
    customerId?: string;
    ownerId?: string;
    search?: string;
  } = {}
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
    // 负责人筛选只对管理员生效；普通负责人已被上面的 ownerId 固定为本人。
    where.ownerId = params.ownerId;
  }
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { remark: { contains: params.search, mode: "insensitive" } },
      { customer: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }
  return where;
}

// ---------------------------------------------------------------------------
// 线索
// ---------------------------------------------------------------------------

/** 线索列表的公共 where，list 与分页 count 共用，避免两处条件漂移。 */
function leadWhere(
  params: { status?: string; ownerId?: string; search?: string },
  scope: AccessScope
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { ...ownerWhere(scope) };
  if (params.status) {
    where.status = params.status as Prisma.LeadWhereInput["status"];
  }
  if (params.ownerId && scope.role === "ADMIN") {
    where.ownerId = params.ownerId;
  }
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { contactPhone: { contains: params.search, mode: "insensitive" } },
      { contactEmail: { contains: params.search, mode: "insensitive" } },
    ];
  }
  return where;
}

/** 查询线索列表（含负责人）。支持分页与关键词搜索。 */
export async function listLeads(
  params: {
    status?: string;
    ownerId?: string;
    search?: string;
    skip?: number;
    take?: number;
  },
  scope: AccessScope
) {
  return prisma.lead.findMany({
    where: leadWhere(params, scope),
    include: { owner: true },
    orderBy: { createdAt: "desc" },
    skip: params.skip ?? 0,
    take: params.take ?? 50,
  });
}

/**
 * 线索分页计数：where 与 listLeads 共用 leadWhere，保证总数与列表一致。
 */
export async function countLeadsForPage(
  params: { status?: string; ownerId?: string; search?: string },
  scope: AccessScope
): Promise<number> {
  return prisma.lead.count({ where: leadWhere(params, scope) });
}

/** 统计当前权限范围内的线索数。 */
export async function countLeads(scope: AccessScope): Promise<number> {
  return prisma.lead.count({ where: ownerWhere(scope) });
}

/**
 * 按状态统计线索数（全量，不受分页影响）。
 *
 * 与 listLeads / countLeadsForPage 共用 leadWhere，所以带上同一套搜索与负责人
 * 条件时，各状态之和恒等于列表的总数——状态卡的分母因此可以复用 total，
 * 不必自己再加一次。
 */
export async function countLeadsByStatus(
  params: { ownerId?: string; search?: string },
  scope: AccessScope
): Promise<Record<string, number>> {
  const groups = await prisma.lead.groupBy({
    by: ["status"],
    where: leadWhere(params, scope),
    _count: { _all: true },
  });
  return Object.fromEntries(
    groups.map((group) => [group.status, group._count._all])
  );
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

/** 查询商机列表（含客户与负责人），按当前负责人角色收窄。支持分页。 */
export async function listOpportunities(
  params: {
    stage?: string;
    customerId?: string;
    ownerId?: string;
    search?: string;
    skip?: number;
    take?: number;
  } = {},
  scope: CurrentUser
) {
  return prisma.opportunity.findMany({
    where: opportunityWhere(scope, params),
    include: { customer: true, owner: true },
    orderBy: { createdAt: "desc" },
    skip: params.skip ?? 0,
    take: params.take ?? 50,
  });
}

/**
 * 商机分页计数：where 与 listOpportunities 共用 opportunityWhere，
 * 保证筛选（阶段/客户/负责人）与权限口径下总数与列表一致。
 */
export async function countOpportunitiesForPage(
  params: {
    stage?: string;
    customerId?: string;
    ownerId?: string;
    search?: string;
  } = {},
  scope: CurrentUser
): Promise<number> {
  return prisma.opportunity.count({ where: opportunityWhere(scope, params) });
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

/**
 * 实时按销售阶段聚合当前权限范围内的商机数量。
 * 管理员统计全部商机，普通负责人仅统计本人负责商机。
 *
 * 普通负责人的统计口径是 `Opportunity.ownerId`，与下钻列表
 * `listOpportunities`（`opportunityWhere` 同样按 `ownerId` 收窄）一致，
 * 因此漏斗数字与 `/opportunities?stage=` 的条数对得上。
 * 这与单据类对象（报价/合同/订单/回款）按**客户负责人**收窄的口径是有意不同：
 * 漏斗讲的是商机归属。
 */
export async function countOpportunitiesByStage(
  scope: CurrentUser
): Promise<Array<{ stage: OpportunityStage; count: number; amount: number }>> {
  const groups = await prisma.opportunity.groupBy({
    by: ["stage"],
    where: ownerWhere({ userId: scope.id, role: scope.role }),
    _count: { _all: true },
    // 漏斗每一级要同时回答"几单"和"多少钱"，金额在阶段间才是可比的
    _sum: { amount: true },
  });
  return groups.map((group) => ({
    stage: group.stage,
    count: group._count._all,
    amount: group._sum?.amount ?? 0,
  }));
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

  // 归属人一律取当前会话，忽略调用方传入的 owner。
  const { owner: _ignoredOwner, ...rest } = data;

  // Prisma 不允许同时使用关系连接（customer/opportunity 嵌套）与外键标量（customerId 等）。
  // 这里统一改用 unchecked 写法：把关系连接还原为外键 ID，再补 ownerId。
  const asChecked = rest as Prisma.FollowUpCreateInput;
  const asUnchecked = rest as Prisma.FollowUpUncheckedCreateInput;
  const nextData: Prisma.FollowUpUncheckedCreateInput = {
    mode: asChecked.mode,
    content: asChecked.content,
    nextFollowUpAt: asChecked.nextFollowUpAt ?? null,
    customerId:
      asUnchecked.customerId ?? asChecked.customer?.connect?.id ?? null,
    opportunityId:
      asUnchecked.opportunityId ?? asChecked.opportunity?.connect?.id ?? null,
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
