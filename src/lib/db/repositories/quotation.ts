import { prisma } from "../client";
import { ownerWhere, type AccessScope } from "@/lib/auth/scope";
import { QuotationStatus, type Quotation } from "../../../generated/prisma/client";

/**
 * 报价数据访问层（#34）。
 *
 * 报价没有独立的负责人字段：普通负责人的权限完全由报价关联客户的负责人决定，
 * 管理员可访问全部。报价金额不是独立输入，始终由条目数量乘单价汇总写入。
 */

/** 越权或不存在时统一返回该错误，避免泄露报价存在性。 */
export class QuotationNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "QuotationNotFoundError";
  }
}

/** 报价条目的可写字段。 */
export interface QuotationItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

/** 新建报价的输入。客户 ID 从关联商机读取，不信任调用方伪造。 */
export interface CreateQuotationInput {
  opportunityId: string;
  status?: QuotationStatus;
  items: QuotationItemInput[];
}

/** 编辑报价的输入；不提供 items 时只更新状态，金额保持不变。 */
export interface UpdateQuotationInput {
  status?: QuotationStatus;
  items?: QuotationItemInput[];
}

/** 金额由条目独立计算，不接收表单提交的金额。 */
function sumItems(items: QuotationItemInput[]): number {
  return items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0
  );
}

/** 把权限范围转成报价的 Prisma where 条件。 */
function quotationWhere(
  scope: AccessScope,
  id?: string
): { id?: string; customer?: { ownerId: string } } {
  const where: { id?: string; customer?: { ownerId: string } } = {};
  if (id) where.id = id;
  const customerScope = ownerWhere(scope) as { ownerId?: string };
  if (customerScope.ownerId) {
    where.customer = { ownerId: customerScope.ownerId };
  }
  return where;
}

/** 查询商机下的报价列表；普通负责人仅见本人客户的相关报价。 */
export async function listQuotations(
  scope: AccessScope,
  opportunityId?: string
) {
  const where = quotationWhere(scope);
  if (opportunityId) {
    return prisma.quotation.findMany({
      where: { ...where, opportunityId },
      include: {
        customer: true,
        items: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  return prisma.quotation.findMany({
    where,
    include: {
      customer: true,
      opportunity: true,
      items: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** 按 ID 查询报价详情；越权与不存在都返回 null。 */
export async function getQuotation(id: string, scope: AccessScope) {
  return prisma.quotation.findFirst({
    where: quotationWhere(scope, id),
    include: {
      customer: true,
      opportunity: true,
      items: { orderBy: { createdAt: "asc" } },
    },
  });
}

/**
 * 创建报价。从商机读取关联客户，再按客户负责人判定权限：普通负责人
 * 只能关联本人客户，管理员不受限制。金额从条目汇总，不使用传入金额。
 */
export async function createQuotation(
  input: CreateQuotationInput,
  scope: AccessScope
): Promise<Quotation> {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId },
    select: { customerId: true },
  });
  if (!opportunity) {
    throw new QuotationNotFoundError();
  }

  const customer = await prisma.customer.findFirst({
    where: { id: opportunity.customerId, ...ownerWhere(scope) },
    select: { id: true },
  });
  if (!customer) {
    throw new QuotationNotFoundError();
  }

  return prisma.quotation.create({
    data: {
      status: input.status ?? QuotationStatus.DRAFT,
      amount: sumItems(input.items),
      customer: { connect: { id: customer.id } },
      opportunity: { connect: { id: input.opportunityId } },
      items: { create: input.items },
    },
    include: { items: true },
  });
}

/**
 * 编辑报价。先按权限确认报价可访问；提供 items 时替换全部条目并重算金额。
 * 普通负责人不能通过状态或条目改写报价归属。
 */
export async function updateQuotation(
  id: string,
  input: UpdateQuotationInput,
  scope: AccessScope
): Promise<Quotation> {
  const existing = await prisma.quotation.findFirst({
    where: quotationWhere(scope, id),
    select: { id: true },
  });
  if (!existing) {
    throw new QuotationNotFoundError();
  }

  const data: {
    status?: QuotationStatus;
    amount?: number;
    items?: { deleteMany: Record<string, never>; create: QuotationItemInput[] };
  } = {};
  if (input.status !== undefined) {
    data.status = input.status;
  }
  if (input.items !== undefined) {
    data.amount = sumItems(input.items);
    data.items = { deleteMany: {}, create: input.items };
  }

  return prisma.quotation.update({
    where: { id },
    data,
    include: { items: true },
  });
}
