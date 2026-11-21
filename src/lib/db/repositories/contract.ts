import { prisma } from "../client";
import type { AccessScope } from "@/lib/auth/scope";
import { customerOwnerWhere } from "./scoped";
import { ContractNotFoundError } from "./not-found";
import {
  ContractStatus,
  QuotationStatus,
} from "../../../generated/prisma/enums";

// 合同与报价/订单/回款共用同一种越权/不存在错误（NOT_FOUND），实体定义在 ./not-found。
export { ContractNotFoundError };

/**
 * 报价转合同服务（#35）。
 *
 * 合同没有独立负责人字段：普通负责人的权限完全由合同关联客户的负责人决定，
 * 管理员可访问全部。转换、状态确认与合同创建共享一个事务，失败时一起回滚，
 * 不会留下没有来源报价或状态不一致的合同。
 */

/** 合同列表与详情始终带出的来源链路。 */
const contractInclude = {
  customer: true,
  opportunity: true,
  sourceQuotation: true,
} as const;

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
      where: customerOwnerWhere<{ id?: string }>(scope, quotationId),
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
          ...customerOwnerWhere<{ id?: string }>(scope, quotation.id),
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
    where: customerOwnerWhere<{ id?: string }>(scope),
    include: contractInclude,
    orderBy: { createdAt: "desc" },
  });
}

/** 按 ID 查询合同详情；越权与不存在都返回 null。 */
export async function getContract(id: string, scope: AccessScope) {
  return prisma.contract.findFirst({
    where: customerOwnerWhere<{ id?: string }>(scope, id),
    include: contractInclude,
  });
}
