import { prisma } from "../client";
import { resolveAssignableOwnerId, type AccessScope } from "@/lib/auth/scope";
import { LeadStatus } from "@/generated/prisma/enums";
import type { Customer, Opportunity } from "../../../generated/prisma/client";
import { getUserById } from "./user";
import { notifyUser } from "@/lib/feishu/message/notify";

/**
 * 线索转化服务。
 *
 * 「转化」在一个事务内新建客户与商机、并把线索标记为已转化：任意一步失败时
 * 整个事务回滚，不留下半转化数据。普通负责人只能转化本人线索，新对象强制
 * 归属本人；管理员可指定负责人。
 */

/** 转化被拒绝（越权、线索不存在或已转化）。 */
export class LeadConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadConversionError";
  }
}

/** 转化结果。 */
export interface LeadConversionResult {
  customer: Customer;
  opportunity: Opportunity;
  leadId: string;
}

/** 把线索来源写入商机备注，保留来源信息而不改动数据模型。 */
function sourceRemark(
  source: string | null | undefined,
  remark: string | null | undefined
) {
  const parts: string[] = [];
  if (source) {
    parts.push(`来源：${source}`);
  }
  if (remark) {
    parts.push(remark);
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * 把线索转化为客户与商机。
 *
 * 先在事务外只读线索用于继承字段；事务内的 updateMany 守卫同时完成鉴权与
 * 领取：普通负责人只匹配本人线索，且状态不能已是 CONVERTED；count 为 0 时
 * 立即拒绝，不产生任何写入。三次写入共享同一事务，失败时一起回滚。
 */
export async function convertLeadToCustomerAndOpportunity(
  leadId: string,
  scope: AccessScope,
  options: { ownerId?: string | null } = {}
): Promise<LeadConversionResult> {
  const requestedOwnerId = options.ownerId?.trim() || null;
  const ownerId = resolveAssignableOwnerId(scope, requestedOwnerId);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (
    !lead ||
    (scope.role === "OWNER" && lead.ownerId !== scope.userId)
  ) {
    throw new LeadConversionError("FORBIDDEN");
  }

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.lead.updateMany({
      where: {
        id: leadId,
        status: { not: LeadStatus.CONVERTED },
        ...(scope.role === "OWNER" ? { ownerId: scope.userId } : {}),
      },
      data: { status: LeadStatus.CONVERTED },
    });
    if (claimed.count === 0) {
      throw new LeadConversionError("FORBIDDEN");
    }

    const customer = await tx.customer.create({
      data: {
        name: lead.name,
        phone: lead.contactPhone,
        email: lead.contactEmail,
        ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
      },
    });

    const opportunity = await tx.opportunity.create({
      data: {
        name: lead.name,
        customer: { connect: { id: customer.id } },
        remark: sourceRemark(lead.source, lead.remark),
        ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
      },
    });

    return { customer, opportunity, leadId };
  });

  // 与商机创建保持一致：转化成功后通知实际负责人。通知失败不影响转化结果。
  const ownerIdForNotice = result.opportunity.ownerId ?? null;
  if (ownerIdForNotice) {
    const owner = await getUserById(ownerIdForNotice);
    await notifyUser(
      owner ? { name: owner.name, feishuOpenId: owner.feishuOpenId } : null,
      "opportunity_created",
      {
        opportunityName: result.opportunity.name,
        customerName: result.customer.name,
      }
    ).catch(() => undefined);
  }

  return result;
}
