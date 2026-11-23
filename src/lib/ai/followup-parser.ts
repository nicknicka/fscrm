import { prisma } from "@/lib/db/client";
import { completeWithActiveModel } from "@/lib/ai/model-config";
import { normalizeName } from "@/lib/name-normalize";
import type { FollowUpMode } from "@/generated/prisma/enums";

/**
 * 把一条飞书消息解析成结构化的跟进记录。
 *
 * 设计原则：**模型只做理解，不做决定**。
 * - 模型输出严格限定的 JSON（客户名、方式、摘要、下一步时间、金额等）；
 * - 客户匹配由代码在候选列表里做，模型只能从候选中挑，不能凭空捏造客户 ID；
 * - 任何字段不合规、或匹配不到客户时，返回 `needs_clarification`，
 *   由机器人追问，而不是硬写一条脏数据。
 *
 * 这样即使模型胡说，最坏结果也是「没记上」，不会污染跟进数据。
 */

/** 解析结果的三种结局。 */
export type ParseOutcome =
  | {
      kind: "ready";
      /** 匹配到的客户。 */
      customerId: string;
      customerName: string;
      /** 匹配到的商机（可选）。 */
      opportunityId: string | null;
      opportunityName: string | null;
      mode: FollowUpMode;
      content: string;
      nextFollowUpAt: Date | null;
      /** 从消息里读出的金额（元），仅用于在卡片上提示，不直接改商机金额。 */
      amount: number | null;
      /** 解析引擎，便于界面上标注「由模型解析」。 */
      engine: "model" | "rules";
    }
  | {
      kind: "needs_clarification";
      reason: string;
      /** 可能的候选客户，供追问时给出选项。 */
      candidates: { id: string; name: string }[];
      /** 解析出的原始摘要，追问时一并展示，让用户看到「理解到了什么」。 */
      partialContent: string | null;
    }
  | {
      kind: "not_a_followup";
      reason: string;
    };

/** 供模型选择的客户候选（已按当前用户权限收窄）。 */
export interface CustomerCandidate {
  id: string;
  name: string;
  opportunities: { id: string; name: string; stage: string }[];
}

const SYSTEM_PROMPT = `你是一个 CRM 销售助手，负责把销售在飞书里随手发的一句话解析成结构化的跟进记录。

只输出 JSON，不要输出任何解释、Markdown 代码块或多余文字。JSON 结构：
{
  "is_followup": true 或 false,
  "customer_name": "从消息里识别出的客户/公司名，没有就留空字符串",
  "mode": "CALL" | "MEETING" | "EMAIL" | "IM" | "OTHER",
  "content": "一句话摘要，客观描述这次沟通发生了什么，不要编造消息里没有的信息",
  "next_follow_up_at": "YYYY-MM-DD 或空字符串",
  "amount": 数字或 null,
  "opportunity_name": "提到的商机名，没有就留空字符串"
}

判断规则：
- is_followup 为 false 的情况：只是打招呼、问问题、闲聊，或者没有任何客户沟通内容。
- mode：打电话=CALL，见面/拜访=MEETING，邮件=EMAIL，微信/飞书/短信等线上沟通=IM，无法判断=OTHER。
- next_follow_up_at：只填消息里明确提到的时间点（如「下周三」「明天下午」要换算成具体日期）；没提到就留空字符串，不要猜。
- amount：只填明确提到的金额数字（单位元）；"80万"要输出 800000；没提到就 null。
- content 不超过 60 个汉字，用第三人称陈述（如「客户表示预算 80 万，要求下周提交方案」）。

今天是 {TODAY}。`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 把用户消息和候选客户拼成一次请求的输入。 */
function buildUserPrompt(
  text: string,
  candidates: CustomerCandidate[]
): string {
  const candidateBlock =
    candidates.length === 0
      ? "（当前用户还没有任何客户）"
      : candidates
          .map((c) => {
            const opps = c.opportunities
              .map((o) => `${o.name}（阶段 ${o.stage}）`)
              .join("、");
            return `- ${c.name}${opps ? `｜商机：${opps}` : ""}`;
          })
          .join("\n");
  return `可选客户列表（只能从中匹配，没有匹配项就留空 customer_name）：\n${candidateBlock}\n\n销售发来的消息：\n${text}`;
}

/** 宽松地从模型回复里抽出 JSON 对象（兼容多包了代码块或前后缀文字的情况）。 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型回复里没有 JSON 对象");
  }
  return JSON.parse(body.slice(start, end + 1));
}

const MODE_VALUES = new Set<string>([
  "CALL",
  "MEETING",
  "EMAIL",
  "IM",
  "OTHER",
]);

interface RawModelOutput {
  is_followup?: unknown;
  customer_name?: unknown;
  mode?: unknown;
  content?: unknown;
  next_follow_up_at?: unknown;
  amount?: unknown;
  opportunity_name?: unknown;
}

/** 名称归一化实现见 `lib/name-normalize.ts`，这里 re-export 保持既有引用不变。 */
export { normalizeName } from "@/lib/name-normalize";

/**
 * 从候选里挑客户：先精确（归一化后相等），再互相包含。
 *
 * 多条命中同一客户时视为匹配成功；命中多个不同客户时返回歧义候选，
 * 交由用户选择——这正是机器人该追问的场景。
 */
export type CustomerMatch =
  | { kind: "matched"; candidate: CustomerCandidate }
  | { kind: "ambiguous"; options: CustomerCandidate[] }
  | { kind: "none"; options: CustomerCandidate[] };

export function matchCustomer(
  name: string,
  candidates: CustomerCandidate[]
): CustomerMatch {
  const target = normalizeName(name);
  if (!target) return { kind: "none", options: [] };

  const exact = candidates.filter((c) => normalizeName(c.name) === target);
  if (exact.length >= 1) {
    // 同名客户极少见；多命中时取第一个仍可接受（同一公司在系统里重复登记）
    return { kind: "matched", candidate: exact[0] };
  }

  const fuzzy = candidates.filter((c) => {
    const normalized = normalizeName(c.name);
    if (!normalized) return false;
    return normalized.includes(target) || target.includes(normalized);
  });
  if (fuzzy.length === 1) {
    return { kind: "matched", candidate: fuzzy[0] };
  }
  if (fuzzy.length > 1) {
    return { kind: "ambiguous", options: fuzzy.slice(0, 5) };
  }
  return { kind: "none", options: [] };
}

/** 把「下周三」「明天」这类相对日期换成具体日期；无法解析时返回 null。 */
export function parseRelativeDate(raw: string, now = new Date()): Date | null {
  const text = raw.trim();
  if (!text) return null;

  // 已经是 YYYY-MM-DD
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(`${text}T09:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime()) && /\d{4}/.test(text)) {
    return direct;
  }

  const base = new Date(now);
  base.setHours(9, 0, 0, 0);
  const weekdayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 7,
    天: 7,
  };

  const offset = (days: number) => {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
  };

  if (/今天/.test(text)) return base;
  if (/明天/.test(text)) return offset(1);
  if (/后天/.test(text)) return offset(2);

  const weekMatch = text.match(
    /(下周|本周|这周|下星期|本星期)[一二三四五六日天]/
  );
  if (weekMatch) {
    const target = weekdayMap[weekMatch[0].slice(-1)];
    if (target) {
      const current = base.getDay() === 0 ? 7 : base.getDay();
      let delta = target - current;
      if (/下周|下星期/.test(weekMatch[0])) {
        delta += 7;
      } else if (delta < 0) {
        delta += 7;
      }
      return offset(delta);
    }
  }

  const inDays = text.match(/(\d+)\s*天后/);
  if (inDays) return offset(Number(inDays[1]));

  const monthDay = text.match(/(\d{1,2})月(\d{1,2})[日号]/);
  if (monthDay) {
    const date = new Date(base);
    date.setMonth(Number(monthDay[1]) - 1, Number(monthDay[2]));
    if (date.getTime() < base.getTime())
      date.setFullYear(date.getFullYear() + 1);
    return date;
  }

  return null;
}

/** 规则兜底：模型不可用时按关键词粗略识别，保证机器人至少能记录。 */
export function ruleBasedParse(
  text: string,
  candidates: CustomerCandidate[]
): ParseOutcome {
  const trimmed = text.trim();
  if (trimmed.length < 4) {
    return { kind: "not_a_followup", reason: "消息太短。" };
  }

  const mode: FollowUpMode = /电话|打给|call/i.test(trimmed)
    ? "CALL"
    : /见面|拜访|上门|面谈/i.test(trimmed)
      ? "MEETING"
      : /邮件|email/i.test(trimmed)
        ? "EMAIL"
        : /微信|飞书|短信|聊天/i.test(trimmed)
          ? "IM"
          : "OTHER";

  // 规则模式下只在候选里找字面出现的客户名，命中唯一才算成功
  const hits = candidates.filter((c) => {
    const normalized = normalizeName(c.name);
    return (
      normalized.length >= 2 && normalizeName(trimmed).includes(normalized)
    );
  });
  if (hits.length === 0) {
    return {
      kind: "needs_clarification",
      reason: "没能从消息里认出客户。",
      candidates: [],
      partialContent: trimmed.slice(0, 60),
    };
  }
  if (hits.length > 1) {
    return {
      kind: "needs_clarification",
      reason: "消息里提到了多个客户，请明确一个。",
      candidates: hits.slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
      partialContent: trimmed.slice(0, 60),
    };
  }

  const dateMatch = trimmed.match(
    /(明天|后天|今天|下周[一二三四五六日天]|本周[一二三四五六日天]|\d+天后|\d{1,2}月\d{1,2}[日号])/
  );
  const amountMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);

  return {
    kind: "ready",
    customerId: hits[0].id,
    customerName: hits[0].name,
    opportunityId: hits[0].opportunities[0]?.id ?? null,
    opportunityName: hits[0].opportunities[0]?.name ?? null,
    mode,
    content: trimmed.slice(0, 60),
    nextFollowUpAt: dateMatch ? parseRelativeDate(dateMatch[1]) : null,
    amount: amountMatch
      ? Number(amountMatch[1]) * (amountMatch[2] ? 10000 : 1)
      : null,
    engine: "rules",
  };
}

/**
 * 用模型解析一条消息。
 *
 * @param text 用户发给机器人的原文（已去掉 @ 提及）
 * @param candidates 当前用户权限范围内可见的客户
 */
export async function parseFollowUpWithModel(
  text: string,
  candidates: CustomerCandidate[]
): Promise<ParseOutcome> {
  const { text: raw } = await completeWithActiveModel({
    system: SYSTEM_PROMPT.replace("{TODAY}", todayIso()),
    user: buildUserPrompt(text, candidates),
    jsonMode: true,
  });

  const parsed = extractJsonObject(raw) as RawModelOutput;

  if (parsed.is_followup === false) {
    return {
      kind: "not_a_followup",
      reason: "这条消息看起来不是客户沟通内容。",
    };
  }

  const customerName =
    typeof parsed.customer_name === "string" ? parsed.customer_name.trim() : "";
  const content =
    typeof parsed.content === "string" ? parsed.content.trim() : "";

  if (!content) {
    return {
      kind: "needs_clarification",
      reason: "没能理解这次沟通的内容。",
      candidates: [],
      partialContent: null,
    };
  }

  if (!customerName) {
    return {
      kind: "needs_clarification",
      reason: "没听出是哪个客户，请告诉我客户名称。",
      candidates: [],
      partialContent: content,
    };
  }

  const match = matchCustomer(customerName, candidates);
  if (match.kind === "none") {
    return {
      kind: "needs_clarification",
      reason: `没找到客户「${customerName}」。`,
      candidates: [],
      partialContent: content,
    };
  }
  if (match.kind === "ambiguous") {
    return {
      kind: "needs_clarification",
      reason: `「${customerName}」可能对应多个客户，请选一个。`,
      candidates: match.options.map((c) => ({ id: c.id, name: c.name })),
      partialContent: content,
    };
  }

  const candidate = match.candidate;
  const mode =
    typeof parsed.mode === "string" && MODE_VALUES.has(parsed.mode)
      ? (parsed.mode as FollowUpMode)
      : "OTHER";

  const rawDate =
    typeof parsed.next_follow_up_at === "string"
      ? parsed.next_follow_up_at.trim()
      : "";
  const nextFollowUpAt = rawDate ? parseRelativeDate(rawDate) : null;

  const amount =
    typeof parsed.amount === "number" && Number.isFinite(parsed.amount)
      ? parsed.amount
      : null;

  const oppName =
    typeof parsed.opportunity_name === "string"
      ? parsed.opportunity_name.trim()
      : "";
  const opportunity = oppName
    ? (candidate.opportunities.find(
        (o) => normalizeName(o.name) === normalizeName(oppName)
      ) ??
      candidate.opportunities.find((o) =>
        normalizeName(o.name).includes(normalizeName(oppName))
      ) ??
      candidate.opportunities[0] ??
      null)
    : (candidate.opportunities[0] ?? null);

  return {
    kind: "ready",
    customerId: candidate.id,
    customerName: candidate.name,
    opportunityId: opportunity?.id ?? null,
    opportunityName: opportunity?.name ?? null,
    mode,
    content: content.slice(0, 200),
    nextFollowUpAt,
    amount,
    engine: "model",
  };
}

/** 取出当前用户可见的客户候选（带商机），最多 50 个，避免提示词过长。 */
export async function loadCustomerCandidates(
  ownerId: string,
  role: "ADMIN" | "OWNER"
): Promise<CustomerCandidate[]> {
  const rows = await prisma.customer.findMany({
    where: role === "ADMIN" ? {} : { ownerId },
    take: 50,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      opportunities: {
        take: 3,
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, stage: true },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    opportunities: row.opportunities.map((o) => ({
      id: o.id,
      name: o.name,
      stage: o.stage,
    })),
  }));
}
