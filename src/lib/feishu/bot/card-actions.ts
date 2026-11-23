import type { CurrentUser } from "@/lib/auth/session";
import {
  loadCustomerCandidates,
  parseFollowUpWithModel,
  ruleBasedParse,
} from "@/lib/ai/followup-parser";
import { isModelConfigured } from "@/lib/ai/model-config";
import {
  actionResultCard,
  crmUrl,
  opportunityStageCard,
  publicPoolCard,
} from "@/lib/feishu/cards/templates";
import {
  advanceOpportunityStage,
  claimCustomerForUser,
  logCardAction,
  nextStageOf,
} from "./actions";
import { loadStageLabelMap } from "@/lib/stage-display";
import { resolveCrmUser } from "./identity";
import { followUpCreatedCard } from "@/lib/feishu/cards/templates";
import { recordFollowUp } from "./actions";
import { prisma } from "@/lib/db/client";

/**
 * 卡片按钮点击的处理。
 *
 * 这是整个飞书集成里「飞书原生做不到」的核心：按钮点击带着业务对象 ID 回来，
 * 我们直接写 CRM，再把原卡片刷新掉。用户全程没有离开飞书。
 *
 * 安全前提：按钮的 `value` 由客户端回传，**一律当作不可信输入**。
 * 每个动作都重新从数据库取对象、按当前用户的权限范围校验，
 * 与网页端 Server Action 的校验强度一致，而不是信任卡片上写了什么。
 */

/** 按钮回调的原始事件（SDK 已归一化）。 */
export interface CardActionEventInput {
  messageId: string;
  chatId: string;
  operatorOpenId: string;
  action: string;
  targetId: string;
  /** 其余参数，如目标阶段、原始文本。 */
  params: Record<string, string | undefined>;
}

export interface CardActionOutcome {
  status: "handled" | "unbound_user" | "unknown_action";
  card?: object;
  summary?: string;
}

const KNOWN_ACTIONS = new Set([
  "claim_customer",
  "advance_opportunity_stage",
  "create_followup_for_customer",
  "open_customer",
  "bind_chat_to_customer",
]);

function rejectedCard(message: string): object {
  return actionResultCard({
    title: "操作未完成",
    ok: false,
    markdown: message,
  });
}

/**
 * 处理一次按钮点击。
 *
 * 返回值里的 `card` 会被用来**原地刷新**原消息卡片。
 */
export async function handleCardAction(
  event: CardActionEventInput
): Promise<CardActionOutcome> {
  if (!KNOWN_ACTIONS.has(event.action)) {
    return { status: "unknown_action" };
  }

  const user = await resolveCrmUser(event.operatorOpenId);
  if (!user) {
    return {
      status: "unbound_user",
    };
  }

  const targetType =
    event.action === "advance_opportunity_stage"
      ? "opportunity"
      : event.action === "bind_chat_to_customer"
        ? "chat"
        : "customer";

  const outcome = await dispatch(user, event);

  await logCardAction({
    action: event.action,
    operatorOpenId: event.operatorOpenId,
    operatorUserId: user.id,
    targetType,
    targetId: event.targetId,
    result: outcome.status === "handled" ? "ok" : "rejected",
    detail: outcome.summary,
  });

  return outcome;
}

async function dispatch(
  user: CurrentUser,
  event: CardActionEventInput
): Promise<CardActionOutcome> {
  switch (event.action) {
    case "claim_customer":
      return claimCustomer(user, event);
    case "advance_opportunity_stage":
      return advanceStage(user, event);
    case "create_followup_for_customer":
      return createFollowUpFromCard(user, event);
    case "bind_chat_to_customer":
      return bindChat(user, event);
    case "open_customer":
      // 纯跳转按钮：卡片不变，飞书自己会打开链接
      return { status: "handled", summary: "open_link" };
    default:
      return { status: "unknown_action" };
  }
}

async function claimCustomer(
  user: CurrentUser,
  event: CardActionEventInput
): Promise<CardActionOutcome> {
  const result = await claimCustomerForUser(user, event.targetId);
  if (!result.ok) {
    return {
      status: "handled",
      card: rejectedCard(result.message),
      summary: "claim_failed",
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: event.targetId },
    select: { name: true, level: true, industry: true },
  });

  return {
    status: "handled",
    summary: `claimed by ${user.name}`,
    card: customer
      ? publicPoolCard({
          customerId: event.targetId,
          customerName: customer.name,
          level: customer.level,
          industry: customer.industry,
          assignedTo: user.name,
        })
      : rejectedCard("认领成功，但读取客户信息失败。"),
  };
}

async function advanceStage(
  user: CurrentUser,
  event: CardActionEventInput
): Promise<CardActionOutcome> {
  const targetStage = event.params.stage;
  if (!targetStage) {
    return { status: "handled", card: rejectedCard("缺少目标阶段。") };
  }

  const result = await advanceOpportunityStage(
    user,
    event.targetId,
    targetStage
  );
  if (!result.ok) {
    return {
      status: "handled",
      card: rejectedCard(result.message),
      summary: "advance_failed",
    };
  }

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: event.targetId },
    include: { customer: true },
  });
  const labels = await loadStageLabelMap();
  const fallbackLabel = opportunity?.stage ?? "";

  return {
    status: "handled",
    summary: `stage ${opportunity?.stage}`,
    card: opportunity
      ? opportunityStageCard({
          opportunityId: opportunity.id,
          opportunityName: opportunity.name,
          customerName: opportunity.customer.name,
          stage: opportunity.stage,
          stageLabel:
            result.stageLabel ?? labels[opportunity.stage] ?? fallbackLabel,
          amount: opportunity.amount,
          nextStage: result.nextStage ?? nextStageOf(opportunity.stage),
          actorName: `${user.name} 刚把阶段推进到「${result.stageLabel ?? labels[opportunity.stage] ?? fallbackLabel}」`,
        })
      : rejectedCard("阶段已更新，但读取商机失败。"),
  };
}

/**
 * 从「追问卡片」里点某个候选客户，把原始那段话落成该客户的跟进。
 *
 * 这里再解析一次原始文本（而不是信任卡片里存的解析结果），
 * 因为用户可能隔了一段时间才点按钮，客户候选也可能已经变化。
 */
async function createFollowUpFromCard(
  user: CurrentUser,
  event: CardActionEventInput
): Promise<CardActionOutcome> {
  const customer = await prisma.customer.findFirst({
    where: {
      id: event.targetId,
      ...(user.role === "OWNER" ? { ownerId: user.id } : {}),
    },
    include: { opportunities: { take: 1, orderBy: { updatedAt: "desc" } } },
  });
  if (!customer) {
    return {
      status: "handled",
      card: rejectedCard("未找到该客户，或它不是由你负责的。"),
      summary: "customer_not_visible",
    };
  }

  const rawText = event.params.originalText ?? "";
  if (!rawText.trim()) {
    return {
      status: "handled",
      card: rejectedCard("没有拿到原始内容，请重新 @我 说一次那段沟通内容。"),
    };
  }

  const candidates = await loadCustomerCandidates(user.id, user.role);
  const forced = candidates.find((c) => c.id === customer.id);
  const usingModel = await isModelConfigured();

  let parsed = usingModel
    ? await parseFollowUpWithModel(rawText, candidates).catch(() =>
        ruleBasedParse(rawText, candidates)
      )
    : ruleBasedParse(rawText, candidates);

  // 用户在追问里明确选了客户，就以选择为准（覆盖模型挑的那个）
  if (parsed.kind === "ready" && parsed.customerId !== customer.id && forced) {
    parsed = {
      ...parsed,
      customerId: forced.id,
      customerName: forced.name,
      opportunityId: forced.opportunities[0]?.id ?? null,
      opportunityName: forced.opportunities[0]?.name ?? null,
    };
  }

  if (parsed.kind !== "ready") {
    // 解析仍失败时，退化成「把原文记为一条 OTHER 跟进」，不让用户的输入白费
    const fallback = await recordFollowUp(user, {
      kind: "ready",
      customerId: customer.id,
      customerName: customer.name,
      opportunityId: customer.opportunities[0]?.id ?? null,
      opportunityName: customer.opportunities[0]?.name ?? null,
      mode: "OTHER",
      content: rawText.slice(0, 200),
      nextFollowUpAt: null,
      amount: null,
      engine: "rules",
    });
    if (!fallback.ok) {
      return { status: "handled", card: rejectedCard(fallback.message) };
    }
    return {
      status: "handled",
      summary: "fallback_raw",
      card: followUpCreatedCard({
        customerId: customer.id,
        customerName: customer.name,
        opportunityName: customer.opportunities[0]?.name ?? null,
        mode: "OTHER",
        content: rawText.slice(0, 200),
        nextFollowUpAt: null,
        amount: null,
        engine: "rules",
      }),
    };
  }

  const saved = await recordFollowUp(user, parsed);
  if (!saved.ok) {
    return { status: "handled", card: rejectedCard(saved.message) };
  }

  return {
    status: "handled",
    summary: `followUp(${parsed.engine}) → ${parsed.customerName}`,
    card: followUpCreatedCard({
      customerId: parsed.customerId,
      customerName: parsed.customerName,
      opportunityName: parsed.opportunityName,
      mode: parsed.mode,
      content: parsed.content,
      nextFollowUpAt: parsed.nextFollowUpAt,
      amount: parsed.amount,
      engine: parsed.engine,
    }),
  };
}

/**
 * 把这个飞书群绑定到某个客户（跟进时自动带出客户上下文）。
 *
 * 绑定本身不涉及权限提升：只是记住「这个群聊的是哪个客户」，
 * 用它生成的跟进记录仍然受当前用户可见范围约束。
 */
async function bindChat(
  user: CurrentUser,
  event: CardActionEventInput
): Promise<CardActionOutcome> {
  const customer = await prisma.customer.findFirst({
    where: {
      id: event.targetId,
      ...(user.role === "OWNER" ? { ownerId: user.id } : {}),
    },
    select: { id: true, name: true },
  });
  if (!customer) {
    return { status: "handled", card: rejectedCard("未找到该客户。") };
  }

  const chatId = event.params.chatId;
  if (!chatId) {
    return { status: "handled", card: rejectedCard("缺少群 ID。") };
  }

  await prisma.chatBinding.upsert({
    where: { chatId },
    create: { chatId, customerId: customer.id, boundByUserId: user.id },
    update: { customerId: customer.id, boundByUserId: user.id },
  });

  return {
    status: "handled",
    summary: `bound chat to ${customer.name}`,
    card: actionResultCard({
      title: "群已绑定客户",
      ok: true,
      markdown: `本群已绑定到 **${customer.name}**。之后在这个群里 @我 记跟进，客户会自动带出来。`,
      buttons: [
        {
          text: "打开客户档案",
          type: "primary",
          value: {
            action: "open_customer",
            targetId: customer.id,
            url: crmUrl(`/customers/${customer.id}`),
          },
        },
      ],
    }),
  };
}
