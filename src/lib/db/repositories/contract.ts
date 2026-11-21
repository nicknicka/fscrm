import { prisma } from "../client";
import { ownerWhere, type AccessScope } from "@/lib/auth/scope";
import {
  ContractStatus,
  QuotationStatus,
} from "../../../generated/prisma/enums";

/**
 * 报价转合同服务（#35）。
 *
 * 合同没有独立负责人字段：普通负责人的权限完全由合同关联客户的负责人决定，
 * 管理员可访问全部。转换、状态确认与合同创建共享一个事务，失败时一起回滚，
 * 不会留下没有来源报价或状态不一致的合同。
 */

/** 越权或不存在时统一返回该错误，避免泄露报价存在性。 */
export class ContractNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "ContractNotFoundError";
  }
}

/** 合同列表与详情始终带出的来源链路。 */
const contractInclude = {
  customer: true,
  opportunity: true,
  sourceQuotation: true,
} as const;

/** 把权限范围转成报价/合同的 Prisma where 条件。 */
function scopedWhere(
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

/**
 * 把报价转为合同。
 *
 * 先在事务内按权限读取报价；草稿报价在同一事务内标记为已确认，随后创建合同，
 * 保留客户、商机与来源报价三条关联。来源报价唯一，避免重复转换产生孤儿数据。
 *
 * 重复转换（同一报价已产生合同）与越权、不存在一样统一返回 NOT_FOUND：
 * 事务内先按 `sourceQuotationId` 查重，避免把 Prisma P2002 直接抛给调用方；
 * 数据库的唯一约束仍是并发下最后的兜底。
 */
export async function convertQuotationToContract(
  quotationId: string,
  scope: AccessScope
) {
  return prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findFirst({
      where: scopedWhere(scope, quotationId),
      select: {
        id: true,
        customerId: true,
        opportunityId: true,
        status: true,
        amount: true,
      },
    });
    if (!quotation || quotation.status === QuotationStatus.CANCELLED) {
      throw new ContractNotFoundError();
    }

    const existing = await tx.contract.findUnique({
      where: { sourceQuotationId: quotation.id },
      select: { id: true },
    });
    if (existing) {
      throw new ContractNotFoundError();
    }

    if (quotation.status !== QuotationStatus.CONFIRMED) {
      const confirmed = await tx.quotation.updateMany({
        where: {
          ...scopedWhere(scope, quotation.id),
          status: { not: QuotationStatus.CONFIRMED },
        },
        data: { status: QuotationStatus.CONFIRMED },
      });
      if (confirmed.count === 0) {
        throw new ContractNotFoundError();
      }
    }

    return tx.contract.create({
      data: {
        status: ContractStatus.DRAFT,
        amount: quotation.amount,
        customer: { connect: { id: quotation.customerId } },
        opportunity: { connect: { id: quotation.opportunityId } },
        sourceQuotation: { connect: { id: quotation.id } },
      },
      include: contractInclude,
    });
  });
}

/** 查询合同列表；普通负责人仅见本人客户的相关合同。 */
export async function listContracts(scope: AccessScope) {
  return prisma.contract.findMany({
    where: scopedWhere(scope),
    include: contractInclude,
    orderBy: { createdAt: "desc" },
  });
}

/** 按 ID 查询合同详情；越权与不存在都返回 null。 */
export async function getContract(id: string, scope: AccessScope) {
  return prisma.contract.findFirst({
    where: scopedWhere(scope, id),
    include: contractInclude,
  });
}
