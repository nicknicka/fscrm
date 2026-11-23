import { prisma } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";
import {
  loadCustomerCandidates,
  parseFollowUpWithModel,
  ruleBasedParse,
  type ParseOutcome,
} from "@/lib/ai/followup-parser";
import { isModelConfigured } from "@/lib/ai/model-config";
import {
  clarificationCard,
  followUpCreatedCard,
  unboundUserCard,
} from "@/lib/feishu/cards/templates";
import { recordFollowUp } from "./actions";
import { resolveCrmUser } from "./identity";
import { sendCard } from "./sender";

/**
 * 「@机器人 说话」的主流程。
 *
 * 顺序刻意如此：
 * 1. **去重**：飞书可能重复推送同一 message_id，先落 `FeishuMessageLog` 占位；
 * 2. **只处理 @了机器人 的消息**，群里普通聊天不打扰；
 * 3. **身份映射**：没绑 CRM 账号就回引导卡片，一个业务动作都不做；
 * 4. **模型解析**：模型不可用/失败时退回规则解析，保证机器人不会装死；
 * 5. **落库 + 回卡片**：卡片带「打开客户档案」「再记一条」按钮。
 *
 * 任何一步失败都回一张能看懂的卡片——销售在飞书里最怕的是「没反应」。
 */

/** 一条待处理的入站消息。 */
export interface InboundMessage {
  messageId: string;
  chatId: string;
  senderOpenId: string;
  /** 已去掉 @提及 的正文。 */
  text: string;
  /** 是否 @了机器人。单聊消息恒为 true。 */
  mentionedBot: boolean;
  chatType: string;
}

/**
 * 抢占消息处理权，实现幂等。
 *
 * 依赖 `messageId` 主键：并发重复推送时只有第一个插入成功。
 */
async function tryAcquireMessage(messageId: string): Promise<boolean> {
  try {
    await prisma.feishuMessageLog.create({
      data: { messageId, outcome: "processing" },
    });
    return true;
  } catch (error) {
    // 唯一约束冲突 = 已处理过
    if ((error as { code?: string }).code === "P2002") {
      return false;
    }
    console.error("[feishu:bot] 记录消息去重失败，继续处理", error);
    return true;
  }
}

async function finishMessage(
  messageId: string,
  outcome: string,
  followUpId?: string
): Promise<void> {
  try {
    await prisma.feishuMessageLog.update({
      where: { messageId },
      data: { outcome, followUpId: followUpId ?? null },
    });
  } catch (error) {
    console.error("[feishu:bot] 更新消息处理结果失败（已忽略）", error);
  }
}

/** 主处理入口；返回处理摘要，便于命令行脚本输出日志。 */
export async function handleInboundMessage(
  inbound: InboundMessage
): Promise<
  | { status: "ignored"; reason: string }
  | { status: "duplicated" }
  | { status: "handled"; summary: string }
> {
  if (!inbound.mentionedBot && inbound.chatType !== "p2p") {
    return { status: "ignored", reason: "not_mentioned" };
  }

  const text = inbound.text.trim();
  if (!text) {
    await sendCard(
      inbound.chatId,
      clarificationCard({
        reason: "你只 @ 了我，但没有说内容。",
        text: "（空消息）",
        candidates: [],
      })
    );
    return { status: "handled", summary: "empty_message" };
  }

  if (!(await tryAcquireMessage(inbound.messageId))) {
    return { status: "duplicated" };
  }

  const user = await resolveCrmUser(inbound.senderOpenId);
  if (!user) {
    await sendCard(inbound.chatId, unboundUserCard(inbound.senderOpenId));
    await finishMessage(inbound.messageId, "unbound_user");
    return { status: "handled", summary: "unbound_user" };
  }

  const outcome = await parseMessage(text, user, inbound.chatId);

  if (outcome.kind === "not_a_followup") {
    await sendCard(
      inbound.chatId,
      clarificationCard({
        reason: outcome.reason,
        text,
        candidates: [],
      })
    );
    await finishMessage(inbound.messageId, "not_a_followup");
    return { status: "handled", summary: "not_a_followup" };
  }

  if (outcome.kind === "needs_clarification") {
    await sendCard(
      inbound.chatId,
      clarificationCard({
        reason: outcome.reason,
        text,
        candidates: outcome.candidates,
      })
    );
    await finishMessage(inbound.messageId, "needs_clarification");
    return { status: "handled", summary: `clarify: ${outcome.reason}` };
  }

  const result = await recordFollowUp(user, outcome);
  if (!result.ok) {
    await sendCard(
      inbound.chatId,
      clarificationCard({
        reason: result.message,
        text,
        candidates: [],
      })
    );
    await finishMessage(inbound.messageId, "write_failed");
    return { status: "handled", summary: "write_failed" };
  }

  await sendCard(
    inbound.chatId,
    followUpCreatedCard({
      customerId: outcome.customerId,
      customerName: outcome.customerName,
      opportunityName: outcome.opportunityName,
      mode: outcome.mode,
      content: outcome.content,
      nextFollowUpAt: outcome.nextFollowUpAt,
      amount: outcome.amount,
      engine: outcome.engine,
    })
  );
  await finishMessage(
    inbound.messageId,
    `handled:${outcome.engine}`,
    result.followUpId
  );
  return {
    status: "handled",
    summary: `followUp(${outcome.engine}) → ${outcome.customerName}`,
  };
}

/**
 * 读取群绑定的客户。
 *
 * 只有一种情况有效：这个群被绑定到某客户，且**当前用户本来就能看到该客户**。
 * 群绑定不被当作权限提升——如果绑定的人不是当前用户，而当前用户无权看这个客户，
 * 行为等同于没有绑定（机器人会正常追问）。
 */
async function loadBoundCustomer(
  chatId: string,
  user: CurrentUser,
  candidates: { id: string; name: string }[]
): Promise<{ id: string; name: string } | null> {
  try {
    const binding = await prisma.chatBinding.findUnique({
      where: { chatId },
      select: { customerId: true },
    });
    if (!binding) return null;
    return candidates.find((c) => c.id === binding.customerId) ?? null;
  } catch (error) {
    console.warn("[feishu:bot] 读取群绑定失败（已忽略）", error);
    return null;
  }
}

/**
 * 解析一条消息：优先模型，失败或未配置时退回规则。
 *
 * 退回规则是有意为之：模型挂了、Key 过期了，机器人还能按关键词记个大概，
 * 并在卡片上明确标注「按关键词识别」，让用户自己判断要不要核对。
 */
export async function parseMessage(
  text: string,
  user: CurrentUser,
  chatId?: string
): Promise<ParseOutcome> {
  const candidates = await loadCustomerCandidates(user.id, user.role);

  // 群绑定的客户：只在这个群主动 @机器人 时才带出，且必须仍是当前用户可见的客户
  const bound = chatId
    ? await loadBoundCustomer(chatId, user, candidates)
    : null;
  if (bound && !text.includes(bound.name)) {
    // 把绑定的客户名补进消息，让模型/规则都能识别出来；
    // 这样「今天电话聊了」这类省略主语的句子在绑定群里也能记上
    text = `${bound.name}：${text}`;
  }

  if (!(await isModelConfigured())) {
    // 未配置模型：直接走规则，避免让用户干等
    return ruleBasedParse(text, candidates);
  }

  try {
    return await parseFollowUpWithModel(text, candidates);
  } catch (error) {
    console.warn("[feishu:bot] 模型解析失败，退回规则解析", error);
    return ruleBasedParse(text, candidates);
  }
}
