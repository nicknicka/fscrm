import { prisma } from "../client";
import type { CurrentUser } from "@/lib/auth/session";
import { BusinessObjectNotFoundError } from "./not-found";
import { DiscountApprovalStatus } from "@/generated/prisma/enums";

/**
 * 折扣审批服务（#69）：负责人为商机发起折扣申请，管理员审批。
 * 审批通过时在事务内按折扣调整商机金额，并记录原金额便于追溯。
 * 越权/不存在统一 NOT_FOUND。
 */

/** 审批列表项带商机与客户名，便于管理员查看。 */
export async function listDiscountApprovals(user: CurrentUser) {
  return prisma.discountApproval.findMany({
    where: user.role === "ADMIN" ? {} : { opportunity: { ownerId: user.id } },
    include: {
      opportunity: {
        select: {
          id: true,
          name: true,
          amount: true,
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** 发起折扣申请：商机必须在当前权限内；折扣率需在 (0,1]。 */
export async function requestDiscountApproval(
  opportunityId: string,
  input: { discountRate: number; reason: string },
  user: CurrentUser
) {
  if (
    !Number.isFinite(input.discountRate) ||
    input.discountRate <= 0 ||
    input.discountRate > 1 ||
    !input.reason.trim()
  ) {
    throw new Error("INVALID_INPUT");
  }
  // 商机必须在当前用户权限内：普通负责人仅本人商机，管理员全部。
  const visible = await prisma.opportunity.findFirst({
    where: {
      id: opportunityId,
      ...(user.role === "OWNER" ? { ownerId: user.id } : {}),
    },
    select: { id: true },
  });
  if (!visible)
    throw new BusinessObjectNotFoundError("DiscountApprovalNotFoundError");

  return prisma.discountApproval.create({
    data: {
      opportunity: { connect: { id: opportunityId } },
      discountRate: input.discountRate,
      reason: input.reason.trim(),
      requestedBy: user.id,
    },
  });
}

/**
 * 管理员审批：事务内更新审批记录；通过时联动调整商机金额。
 * 只允许审批 PENDING 的申请，重复审批拒绝。
 */
export async function reviewDiscountApproval(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  reviewNote: string | null,
  reviewerId: string
) {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.discountApproval.findUnique({
      where: { id: approvalId },
      include: { opportunity: { select: { id: true, amount: true } } },
    });
    if (!approval || approval.status !== DiscountApprovalStatus.PENDING) {
      throw new BusinessObjectNotFoundError("DiscountApprovalNotFoundError");
    }

    const reviewed = await tx.discountApproval.update({
      where: { id: approvalId },
      data: {
        status:
          decision === "APPROVED"
            ? DiscountApprovalStatus.APPROVED
            : DiscountApprovalStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewNote,
        reviewedAt: new Date(),
        originalAmount: approval.opportunity.amount,
      },
    });

    if (decision === "APPROVED" && approval.opportunity.amount !== null) {
      await tx.opportunity.update({
        where: { id: approval.opportunity.id },
        data: {
          amount: approval.opportunity.amount * (1 - approval.discountRate),
        },
      });
    }
    return reviewed;
  });
}
