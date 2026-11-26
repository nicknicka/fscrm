import { prisma } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  claimPublicCustomer,
  CustomerClaimError,
} from "@/lib/db/repositories/customer";
import { createFollowUp } from "@/lib/db/repositories/sales";
import { OpportunityStage } from "@/generated/prisma/enums";
import { loadStageLabelMap } from "@/lib/stage-display";
import type { ParseOutcome } from "@/lib/ai/followup-parser";

/**
 * 机器人的业务动作层。
 *
 * 与网页端复用同一批 repository 函数，因此权限边界只有一处实现：
 * 飞书里点按钮、发消息，和网页上点按钮走的是同一套 `accessScopeFor` + owner 校验。
 * 这一层只负责「把动作做掉并返回可读结果」，不涉及飞书 API。
 */

/** 动作结果：成功与否 + 面向用户的中文说明。 */
export interface ActionResult {
  ok: boolean;
  message: string;
  /** 需要回填到卡片的数据。 */
  data?: Record<string, unknown>;
}

/** 销售阶段顺序，用于计算「下一阶段」。 */
export const STAGE_ORDER: OpportunityStage[] = [
  OpportunityStage.CONTACT,
  OpportunityStage.NEED_CONFIRM,
  OpportunityStage.QUOTE,
  OpportunityStage.NEGOTIATE,
  OpportunityStage.WON,
];

export const STAGE_LABEL: Record<string, string> = {
  CONTACT: "已建立联系",
  NEED_CONFIRM: "需求确认",
  QUOTE: "报价",
  NEGOTIATE: "谈判",
  WON: "赢单",
  LOST: "输单",
};

/** 计算下一阶段；已赢单/输单时返回 null。 */
export function nextStageOf(
  stage: string
): { value: OpportunityStage; label: string } | null {
  const index = STAGE_ORDER.indexOf(stage as OpportunityStage);
  if (index === -1 || index === STAGE_ORDER.length - 1) return null;
  const next = STAGE_ORDER[index + 1];
  return { value: next, label: STAGE_LABEL[next] };
}

/**
 * 把解析结果落成跟进记录。
 *
 * 归属人固定为当前飞书用户，不接受外部传入——与网页端 `createFollowUp` 一致。
 */
export async function recordFollowUp(
  user: CurrentUser,
  parsed: Extract<ParseOutcome, { kind: "ready" }>
): Promise<ActionResult & { followUpId?: string }> {
  try {
    const followUp = await createFollowUp(
      {
        mode: parsed.mode,
        content: parsed.content,
        nextFollowUpAt: parsed.nextFollowUpAt,
        customer: { connect: { id: parsed.customerId } },
        ...(parsed.opportunityId
          ? { opportunity: { connect: { id: parsed.opportunityId } } }
          : {}),
      },
      user
    );
    return {
      ok: true,
      message: "已记录",
      followUpId: followUp.id,
    };
  } catch (error) {
    console.error("[feishu:bot] 写入跟进记录失败", error);
    return {
      ok: false,
      message:
        "写入失败：你可能不是该客户的负责人，或该客户不在你的可见范围内。",
    };
  }
}

/** 认领公海客户。 */
export async function claimCustomerForUser(
  user: CurrentUser,
  customerId: string
): Promise<ActionResult & { customerName?: string }> {
  try {
    const customer = await claimPublicCustomer(
      customerId,
      accessScopeFor(user)
    );
    return {
      ok: true,
      message: `${user.name} 已认领「${customer.name}」`,
      customerName: customer.name,
      data: { ownerName: user.name },
    };
  } catch (error) {
    if (error instanceof CustomerClaimError) {
      return {
        ok: false,
        message: "认领失败：该客户可能已被其他同事抢先认领，刷新后再看。",
      };
    }
    console.error("[feishu:bot] 认领客户失败", error);
    return { ok: false, message: "认领失败，请稍后重试。" };
  }
}

/**
 * 推进商机阶段。
 *
 * 先把 `stage` 再核对一次：卡片上的按钮值来自客户端回传，
 * 不能当成可信输入，必须重新校验目标阶段是否合法、是否为下一步。
 */
export async function advanceOpportunityStage(
  user: CurrentUser,
  opportunityId: string,
  targetStage: string
): Promise<
  ActionResult & {
    opportunityName?: string;
    stage?: string;
    stageLabel?: string;
    nextStage?: { value: string; label: string } | null;
  }
> {
  if (!STAGE_ORDER.includes(targetStage as OpportunityStage)) {
    return { ok: false, message: "目标阶段不合法。" };
  }

  const labels = await loadStageLabelMap();
  const labelOf = (stage: string) =>
    labels[stage] ?? STAGE_LABEL[stage] ?? stage;

  const opportunity = await prisma.opportunity.findFirst({
    where: {
      id: opportunityId,
      ...(user.role === "OWNER" ? { ownerId: user.id } : {}),
    },
    include: { customer: true },
  });
  if (!opportunity) {
    return {
      ok: false,
      message: "未找到该商机，或你不是它的负责人。",
    };
  }

  const expected = nextStageOf(opportunity.stage);
  if (!expected || expected.value !== targetStage) {
    return {
      ok: false,
      message: `当前阶段是「${labelOf(opportunity.stage)}」，不能直接跳到「${labelOf(targetStage)}」。请刷新卡片后再操作。`,
    };
  }

  const updated = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { stage: targetStage as OpportunityStage },
  });

  const configuredNext = nextStageOf(updated.stage);
  return {
    ok: true,
    message: `已推进到「${labelOf(targetStage)}」`,
    opportunityName: updated.name,
    stage: updated.stage,
    stageLabel: labelOf(updated.stage),
    nextStage: configuredNext
      ? { value: configuredNext.value, label: labelOf(configuredNext.value) }
      : null,
  };
}

/** 记录一次卡片操作（审计）。失败不影响业务结果。 */
export async function logCardAction(input: {
  action: string;
  operatorOpenId: string;
  operatorUserId: string | null;
  targetType: string;
  targetId: string;
  result: "ok" | "rejected";
  detail?: string;
}): Promise<void> {
  try {
    await prisma.cardActionLog.create({ data: input });
  } catch (error) {
    console.error("[feishu:bot] 写入卡片操作日志失败（已忽略）", error);
  }
}
