import type { FeishuEventHandler } from "../types";
import {
  handleCardAction,
  type CardActionEventInput,
} from "../../bot/card-actions";
import { unboundUserCard } from "../../cards/templates";
import { updateCard } from "../../bot/sender";

/**
 * `card.action.trigger`（卡片按钮点击）处理器。
 *
 * 流程：归一化事件 → 交给 `bot/card-actions.ts` 执行业务动作 →
 * 用 `updateCard` 把**被点的那张卡片原地刷新**成新状态。
 *
 * 刷新卡片而不是「再发一条新消息」，是让交互留在原地、不刷屏的关键。
 * 如果刷新失败（例如超过飞书对卡片更新的时间限制），退化为回一张结果卡片。
 */

interface RawCardActionData {
  operator?: {
    open_id?: string;
    user_id?: string;
  };
  action?: {
    value?: unknown;
    tag?: string;
    name?: string;
  };
  context?: {
    open_message_id?: string;
    open_chat_id?: string;
  };
}

/** 把按钮 value（可能是对象也可能是 JSON 字符串）归一化成扁平的参数表。 */
export function normalizeActionValue(
  value: unknown
): Record<string, string | undefined> {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const result: Record<string, string | undefined> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") {
      result[key] = entry;
    } else if (typeof entry === "number") {
      result[key] = String(entry);
    }
  }
  return result;
}

/** 从卡片回调事件里提取动作。 */
export function extractCardAction(data: unknown): CardActionEventInput | null {
  const event = (data ?? {}) as RawCardActionData;
  const value = normalizeActionValue(event.action?.value);
  const action = value.action;
  const targetId = value.targetId;
  const messageId = event.context?.open_message_id;
  const chatId = event.context?.open_chat_id;
  const operatorOpenId = event.operator?.open_id;

  if (!action || !targetId || !operatorOpenId) {
    return null;
  }

  return {
    messageId: messageId ?? "",
    chatId: chatId ?? "",
    operatorOpenId,
    action,
    targetId,
    params: value,
  };
}

export const handleCardActionEvent: FeishuEventHandler = async ({ data }) => {
  const event = extractCardAction(data);
  if (!event) {
    console.warn("[feishu:card] 无法解析卡片回调，已忽略");
    return;
  }

  const outcome = await handleCardAction(event);

  if (outcome.status === "unbound_user") {
    if (event.messageId) {
      await updateCard(event.messageId, unboundUserCard(event.operatorOpenId));
    }
    return;
  }

  if (outcome.status === "unknown_action") {
    console.warn(`[feishu:card] 未知动作 ${event.action}，已忽略`);
    return;
  }

  if (outcome.card && event.messageId) {
    const updated = await updateCard(event.messageId, outcome.card);
    if (!updated.ok) {
      console.error(
        `[feishu:card] 卡片刷新失败 action=${event.action}`,
        updated.error
      );
    }
  }

  console.log(
    `[feishu:card] ${event.action} target=${event.targetId} → ${outcome.summary ?? "ok"}`
  );
};

export { handleCardActionEvent as handleCardAction };
