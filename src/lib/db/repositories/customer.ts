import { prisma } from "../client";
import type { CurrentUser } from "@/lib/auth/session";
import type { Customer, Prisma } from "../../../generated/prisma/client";

/**
 * 客户数据访问层。
 *
 * 封装客户的常用查询与写入操作，供页面与业务服务复用。
 */

/** 客户列表查询参数。 */
export interface ListCustomersParams {
  /** 按名称模糊搜索。 */
  search?: string;
  /** 按负责人筛选。 */
  ownerId?: string;
  /** 分页：跳过条数。 */
  skip?: number;
  /** 分页：取多少条。 */
  take?: number;
}

/** 查询客户列表（含负责人与联系人数量）。 */
export async function listCustomers(params: ListCustomersParams = {}) {
  const where: Prisma.CustomerWhereInput = {};
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } },
    ];
  }
  if (params.ownerId) {
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

/** 客户详情查询参数：当前会话负责决定跟进记录可见范围。 */
export interface GetCustomerParams {
  /** 跟进记录列表按当前会话角色过滤；管理员不过滤。 */
  followUpViewer: CurrentUser;
}

/** 按 ID 查询客户详情（含联系人、商机、权限范围内的跟进记录）。 */
export async function getCustomer(id: string, params: GetCustomerParams) {
  const followUpWhere: Prisma.FollowUpWhereInput =
    params.followUpViewer.role === "ADMIN"
      ? {}
      : {
          OR: [
            { customer: { ownerId: params.followUpViewer.id } },
            { opportunity: { ownerId: params.followUpViewer.id } },
          ],
        };

  return prisma.customer.findUnique({
    where: { id },
    include: {
      owner: true,
      contacts: true,
      opportunities: true,
      followUps: {
        where: followUpWhere,
        include: { owner: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/** 创建客户。 */
export async function createCustomer(
  data: Prisma.CustomerCreateInput
): Promise<Customer> {
  return prisma.customer.create({ data });
}

/** 更新客户。 */
export async function updateCustomer(
  id: string,
  data: Prisma.CustomerUpdateInput
): Promise<Customer> {
  return prisma.customer.update({ where: { id }, data });
}

/** 删除客户（级联删除联系人、商机、跟进记录）。 */
export async function deleteCustomer(id: string): Promise<Customer> {
  return prisma.customer.delete({ where: { id } });
}

/** 统计客户数量。 */
export async function countCustomers(): Promise<number> {
  return prisma.customer.count();
}
