import { prisma } from "../client";
import {
  ownerWhere,
  resolveAssignableOwnerId,
  type AccessScope,
} from "../../auth/scope";
import type { Customer, Prisma } from "../../../generated/prisma/client";
import type { CustomerLevel } from "../../../generated/prisma/enums";
import {
  CUSTOMER_SENSITIVE_FIELDS,
  maskCustomerFields,
  visibleCustomerFields,
} from "./field-permission";

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

/** 客户列表的公共 where，list 与分页 count 共用，保证搜索/筛选口径一致。
 * 普通负责人不能按不可见的敏感字段搜索，避免通过结果反推字段内容。 */
async function customerListWhere(
  params: ListCustomersParams,
  scope: AccessScope
): Promise<Prisma.CustomerWhereInput> {
  const where: Prisma.CustomerWhereInput = { ...ownerWhere(scope) };
  if (params.search) {
    const visible = await visibleCustomerFields(scope.role);
    const searchable: Prisma.CustomerWhereInput[] = [
      { name: { contains: params.search, mode: "insensitive" } },
    ];
    if (visible.has("phone")) {
      searchable.push({
        phone: { contains: params.search, mode: "insensitive" },
      });
    }
    if (visible.has("email")) {
      searchable.push({
        email: { contains: params.search, mode: "insensitive" },
      });
    }
    where.OR = searchable;
  }
  if (scope.role === "ADMIN" && params.ownerId) {
    where.ownerId = params.ownerId;
  }
  if (params.unassignedOnly) {
    // 公海客户不属于任何负责人，不能沿用普通负责人的 ownerWhere 过滤。
    // 普通负责人认领前只能看最小信息：请用 listPublicPoolCustomers。
    where.ownerId = null;
  }
  return where;
}

/** 查询客户列表（含负责人与联系人数量）。支持分页。 */
export async function listCustomers(
  params: ListCustomersParams,
  scope: AccessScope
) {
  const rows = await prisma.customer.findMany({
    where: await customerListWhere(params, scope),
    include: {
      owner: true,
      _count: { select: { contacts: true, opportunities: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: params.skip ?? 0,
    take: params.take ?? 50,
  });
  const visible = await visibleCustomerFields(scope.role);
  const allVisible = ["phone", "email", "address"].every((f) =>
    visible.has(f as never)
  );
  return allVisible
    ? rows
    : rows.map((row) => maskCustomerFields(row, visible));
}

/**
 * 全局客户名称列表：不加 owner 过滤，返回所有客户（含他人名下客户）的名称。
 * 仅供导入按名称归一化查重使用；只投影 name，不泄露电话、邮箱、负责人等敏感字段。
 */
export async function listAllCustomerNames(): Promise<Array<{ name: string }>> {
  return prisma.customer.findMany({ select: { name: true } });
}

/**
 * 客户分页计数：where 与 listCustomers 共用 customerListWhere，
 * 保证搜索/筛选条件下总数与列表一致。
 */
export async function countCustomersForPage(
  params: ListCustomersParams,
  scope: AccessScope
): Promise<number> {
  return prisma.customer.count({
    where: await customerListWhere(params, scope),
  });
}

/**
 * 公海列表：普通负责人只拿到最小字段，管理员拿到带负责人与关联统计的完整行。
 * 用重载表达两种返回类型，避免把最小投影混进客户列表的主类型。
 */
export async function listPublicPoolCustomers(
  scope: AccessScope,
  pagination?: { skip?: number; take?: number }
): Promise<
  | PublicPoolCustomerSummary[]
  | Array<Customer & { _count: { contacts: number; opportunities: number } }>
>;
export async function listPublicPoolCustomers(
  scope: AccessScope,
  pagination: { skip?: number; take?: number } = {}
) {
  const where: Prisma.CustomerWhereInput = { ownerId: null };
  const skip = pagination.skip ?? 0;
  const take = pagination.take ?? 50;
  if (scope.role === "OWNER") {
    return prisma.customer.findMany({
      where,
      select: PUBLIC_POOL_OWNER_SELECT,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }
  return prisma.customer.findMany({
    where,
    include: {
      owner: true,
      _count: { select: { contacts: true, opportunities: true } },
    },
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });
}

/** 公海分页计数：只统计 ownerId 为空的客户。 */
export async function countPublicPoolCustomers(
  scope: AccessScope
): Promise<number> {
  // 公海对负责人/管理员可见范围一致（都是 ownerId 为空），scope 仅用于语义对齐。
  void scope;
  return prisma.customer.count({ where: { ownerId: null } });
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

  const found = await prisma.customer.findFirst({
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
      chatBindings: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!found) return null;
  const visible = await visibleCustomerFields(scope.role);
  const allVisible = ["phone", "email", "address"].every((f) =>
    visible.has(f as never)
  );
  return allVisible ? found : maskCustomerFields(found, visible);
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

/** 更新客户：普通负责人只能更新自己的客户，且不能改变负责人。
 * 不可见的敏感字段不会写入，避免掩码字段被表单空值或伪造值覆盖。 */
export async function updateCustomer(
  id: string,
  data: Prisma.CustomerUpdateInput,
  scope: AccessScope
): Promise<Customer> {
  const updateData = { ...data };
  if (scope.role !== "ADMIN") {
    delete updateData.owner;
    const visible = await visibleCustomerFields(scope.role);
    for (const field of CUSTOMER_SENSITIVE_FIELDS) {
      if (!visible.has(field)) delete updateData[field];
    }
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

/**
 * 保存客户自定义字段（JSON 扩展）。权限口径与 updateCustomer 一致：
 * 普通负责人只能改自己负责的客户，管理员可改全部。
 */
export async function saveCustomerCustomFields(
  id: string,
  fields: Record<string, string>,
  scope: AccessScope
): Promise<void> {
  const result = await prisma.customer.updateMany({
    where: { id, ...ownerWhere(scope) },
    data: { customFields: fields },
  });
  if (result.count === 0) {
    throw new CustomerAccessError();
  }
}
