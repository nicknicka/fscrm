import { prisma } from "../client";
import type { AccessScope } from "../../auth/scope";
import { ownerWhere, resolveAssignableOwnerId } from "../../auth/scope";
import type { Customer, Prisma } from "../../../generated/prisma/client";

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
  /** 分页：跳过条数。 */
  skip?: number;
  /** 分页：取多少条。 */
  take?: number;
}

/** 越权或对象不存在时抛出的统一错误，避免泄露对象存在性。 */
export class CustomerAccessError extends Error {
  constructor() {
    super("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");
    this.name = "CustomerAccessError";
  }
}

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

/** 按 ID 查询客户详情（含联系人、商机、跟进记录）。 */
export async function getCustomer(id: string, scope: AccessScope) {
  return prisma.customer.findFirst({
    where: { id, ...ownerWhere(scope) },
    include: {
      owner: true,
      contacts: true,
      opportunities:
        scope.role === "ADMIN" ? true : { where: ownerWhere(scope) },
      followUps: { include: { owner: true }, orderBy: { createdAt: "desc" } },
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
