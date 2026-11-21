import { prisma } from "../client";
import {
  ownerWhere,
  resolveAssignableOwnerId,
  type AccessScope,
} from "../../auth/scope";
import type { Customer, Prisma } from "../../../generated/prisma/client";
import type { CustomerLevel } from "../../../generated/prisma/enums";

/**
 * 客户数据访问层。
 *
 * 所有查询与写入都显式接收当前负责人/管理员的访问范围：
 * 普通负责人只能访问自己负责的客户，管理员可访问与管理全部客户。
 */

/** 客户列表查询参数。 */
export interface ListCustomersParams {
  /** 按名称模糊搜索。 */
  search?: string;
  /** 管理员可按负责人筛选；普通负责人传入的值会被忽略。 */
  ownerId?: string;
  /** 公海：只查询尚无负责人的客户。 */
  unassignedOnly?: boolean;
  /** 分页：跳过条数。 */
  skip?: number;
  /** 分页：取多少条。 */
  take?: number;
}

/**
 * 客户数据的错误契约：越权、不存在、重复认领都抛这两个可判定的错误类，
 * 由 Server Action 用 `instanceof` 统一映射为 NOT_FOUND（与单据类 action 一致），
 * 不依赖 message/name 字符串匹配。
 */

/** 越权或对象不存在时抛出的统一错误，避免泄露对象存在性。 */
export class CustomerAccessError extends Error {
  constructor() {
    super("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");
    this.name = "CustomerAccessError";
  }
}

/** 认领或调整负责人失败时抛出的统一错误，避免泄露客户存在性或归属。 */
export class CustomerClaimError extends Error {
  constructor() {
    super("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");
    this.name = "CustomerClaimError";
  }
}

/**
 * 公海列表对普通负责人只返回认领所需的最小字段（ADR-0003 的有意例外）：
 * 认领前允许看到客户名称、等级、行业这类用于判断「值不值得认领」的展示字段，
 * 但不返回联系电话、邮箱、地址、备注等敏感明细与关联记录。
 */
const PUBLIC_POOL_OWNER_SELECT = {
  id: true,
  name: true,
  level: true,
  industry: true,
} as const;

/** 普通负责人在公海上能看到的客户字段（认领所需的最小信息）。 */
export type PublicPoolCustomerSummary = {
  id: string;
  name: string;
  level: CustomerLevel;
  industry: string | null;
};

/** 查询客户列表（含负责人与联系人数量）。 */
export async function listCustomers(
  params: ListCustomersParams,
  scope: AccessScope
) {
  const where: Prisma.CustomerWhereInput = { ...ownerWhere(scope) };
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
    ];
  }
  if (scope.role === "ADMIN" && params.ownerId) {
    where.ownerId = params.ownerId;
  }
  if (params.unassignedOnly) {
    // 公海客户不属于任何负责人，不能沿用普通负责人的 ownerWhere 过滤。
    // 普通负责人认领前只能看最小信息：请用 listPublicPoolCustomers。
    where.ownerId = null;
  }
  return prisma.customer.findMany({
    where,
    include: {
      owner: true,
      _count: { select: { contacts: true, opportunities: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: params.skip ?? 0,
    take: params.take ?? 50,
  });
}

/**
 * 公海列表：普通负责人只拿到最小字段，管理员拿到带负责人与关联统计的完整行。
 * 用重载表达两种返回类型，避免把最小投影混进客户列表的主类型。
 */
export async function listPublicPoolCustomers(
  scope: AccessScope
): Promise<
  PublicPoolCustomerSummary[] | Array<Customer & { _count: { contacts: number; opportunities: number } }>
>;
export async function listPublicPoolCustomers(scope: AccessScope) {
  const where: Prisma.CustomerWhereInput = { ownerId: null };
  if (scope.role === "OWNER") {
    return prisma.customer.findMany({
      where,
      select: PUBLIC_POOL_OWNER_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }
  return prisma.customer.findMany({
    where,
    include: {
      owner: true,
      _count: { select: { contacts: true, opportunities: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** 按 ID 查询客户详情（含联系人、商机、权限范围内的跟进记录）。 */
export async function getCustomer(id: string, scope: AccessScope) {
  const followUpWhere: Prisma.FollowUpWhereInput =
    scope.role === "ADMIN"
      ? {}
      : {
          OR: [
            { customer: { ownerId: scope.userId } },
            { opportunity: { ownerId: scope.userId } },
          ],
        };

  return prisma.customer.findFirst({
    where: { id, ...ownerWhere(scope) },
    include: {
      owner: true,
      contacts: true,
      opportunities:
        scope.role === "ADMIN" ? true : { where: ownerWhere(scope) },
      followUps: {
        where: followUpWhere,
        include: { owner: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/** 创建客户：普通负责人强制归属自己，管理员可指定或暂不分配。 */
export async function createCustomer(
  data: Prisma.CustomerCreateInput,
  scope: AccessScope
): Promise<Customer> {
  const ownerId = resolveAssignableOwnerId(
    scope,
    data.owner?.connect?.id ?? null
  );
  return prisma.customer.create({
    data: {
      ...data,
      ...(scope.role === "ADMIN"
        ? {}
        : { owner: { connect: { id: scope.userId } } }),
      ...(ownerId && scope.role === "ADMIN"
        ? { owner: { connect: { id: ownerId } } }
        : {}),
    },
  });
}

/** 更新客户：普通负责人只能更新自己的客户，且不能改变负责人。 */
export async function updateCustomer(
  id: string,
  data: Prisma.CustomerUpdateInput,
  scope: AccessScope
): Promise<Customer> {
  const updateData = { ...data };
  if (scope.role !== "ADMIN") {
    delete updateData.owner;
  }
  const result = await prisma.customer.updateMany({
    where: { id, ...ownerWhere(scope) },
    data: updateData as Prisma.CustomerUpdateManyMutationInput,
  });
  if (result.count === 0) {
    throw new CustomerAccessError();
  }
  const updated = await prisma.customer.findUnique({ where: { id } });
  if (!updated) {
    throw new CustomerAccessError();
  }
  return updated;
}

/**
 * 认领公海客户：只有当前仍无负责人时才会写入，防止重复认领。
 *
 * 条件更新在一个原子操作内完成；越权、不存在或已被抢先认领统一拒绝。
 */
export async function claimPublicCustomer(
  id: string,
  scope: AccessScope
): Promise<Customer> {
  if (scope.role === "ADMIN") {
    throw new CustomerClaimError();
  }
  const result = await prisma.customer.updateMany({
    where: { id, ownerId: null },
    data: { ownerId: scope.userId },
  });
  if (result.count !== 1) {
    throw new CustomerClaimError();
  }
  const claimed = await prisma.customer.findUnique({ where: { id } });
  if (!claimed || claimed.ownerId !== scope.userId) {
    throw new CustomerClaimError();
  }
  return claimed;
}

/**
 * 管理员移入公海或指定负责人；普通负责人只能保持自己的归属。
 * 任何越权或不存在都统一拒绝，不泄露客户当前归属。
 */
export async function setCustomerOwner(
  id: string,
  ownerId: string | null,
  scope: AccessScope
): Promise<Customer> {
  const allowedOwnerId = resolveAssignableOwnerId(scope, ownerId);
  const result = await prisma.customer.updateMany({
    where: { id, ...ownerWhere(scope) },
    data: { ownerId: allowedOwnerId },
  });
  if (result.count !== 1) {
    throw new CustomerClaimError();
  }
  const updated = await prisma.customer.findUnique({ where: { id } });
  if (!updated || updated.ownerId !== allowedOwnerId) {
    throw new CustomerClaimError();
  }
  return updated;
}

/** 删除客户（级联删除联系人、商机、跟进记录）。 */
export async function deleteCustomer(
  id: string,
  scope: AccessScope
): Promise<Customer> {
  const customer = await getCustomer(id, scope);
  if (!customer) {
    throw new CustomerAccessError();
  }
  return prisma.customer.delete({ where: { id } });
}

/** 统计当前可见客户数量。 */
export async function countCustomers(scope: AccessScope): Promise<number> {
  return prisma.customer.count({ where: ownerWhere(scope) });
}
