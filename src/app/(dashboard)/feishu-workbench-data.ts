import { prisma } from "@/lib/db/client";
import type { CurrentUser } from "@/lib/auth/session";
import { getUserByFeishuOpenId } from "@/lib/db/repositories/user";

/**
 * 首页「飞书工作台」的数据装配。
 *
 * 这里刻意不新增统计口径：所有数字都由现有业务表实时派生，
 * 只是换一个视角回答「飞书在这个系统里干了什么」：
 * - 机器人最近处理了哪些消息、哪些落成了跟进；
 * - 通过飞书卡片完成的认领/推进有多少次（与网页端操作对比可见）；
 * - 还有哪些同事的飞书身份没绑定（这是飞书能力能不能用的前提）。
 */

/** 一条机器人处理记录（用于首页时间线）。 */
export interface BotActivity {
  messageId: string;
  outcome: string;
  createdAt: Date;
  /** 若是通过飞书创建的跟进，带上摘要。 */
  followUp: {
    content: string;
    mode: string;
    customerName: string | null;
    ownerName: string | null;
    createdAt: Date;
  } | null;
}

/** 一次卡片按钮操作。 */
export interface CardActivity {
  id: string;
  action: string;
  result: string;
  operatorName: string | null;
  createdAt: Date;
  targetType: string;
}

/** 首页所需的全部数据。 */
export interface FeishuWorkbenchData {
  /** 是否已绑定飞书身份（当前用户）。 */
  selfBound: boolean;
  bot: {
    /** 机器人处理过的消息总数。 */
    totalMessages: number;
    /** 成功落成跟进记录的数量。 */
    followUpsFromFeishu: number;
    /** 需要追问的比例里，最近需要澄清的条数。 */
    clarifications: number;
    /** 通过卡片按钮完成的业务动作数。 */
    cardActions: number;
    /** 最近活动（按时间倒序）。 */
    recent: BotActivity[];
    recentCardActions: CardActivity[];
  };
  /** 未绑定飞书身份的用户（仅管理员关心）。 */
  unboundUsers: { id: string; name: string }[];
  /** 模型是否已配置（决定机器人能不能真正理解人话）。 */
  modelReady: boolean;
  /** 主动推送的提醒：机器人不只是被动回答，还会定时催办。 */
  reminders: {
    batches: number;
    items: number;
    /** 因负责人未绑定飞书而发不出去的批次数。 */
    undeliverable: number;
  };
}

const OUTCOME_LABEL: Record<string, string> = {
  handled: "已记录",
  "handled:model": "已记录",
  "handled:rules": "已记录",
  needs_clarification: "追问了用户",
  not_a_followup: "判为非跟进",
  unbound_user: "提示绑定账号",
  write_failed: "写入失败",
  processing: "处理中",
};

export function describeOutcome(outcome: string): string {
  if (outcome.startsWith("handled")) return "已记录到 CRM";
  return OUTCOME_LABEL[outcome] ?? outcome;
}

const ACTION_LABEL: Record<string, string> = {
  claim_customer: "认领公海客户",
  advance_opportunity_stage: "推进商机阶段",
  create_followup_for_customer: "记一条跟进",
  bind_chat_to_customer: "绑定群到客户",
  open_customer: "打开客户档案",
};

export function describeCardAction(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/** 装配首页数据。 */
export async function loadFeishuWorkbench(
  currentUser: CurrentUser,
  modelReady: boolean
): Promise<FeishuWorkbenchData> {
  const isAdmin = currentUser.role === "ADMIN";
  const { scanReminders } = await import("@/lib/reminders/scan");
  const reminderScan = await scanReminders();
  const visibleReminders = isAdmin
    ? reminderScan.batches
    : reminderScan.batches.filter((b) => b.ownerId === currentUser.id);

  const [
    totalMessages,
    followUpsFromFeishu,
    clarifications,
    cardActions,
    logRows,
    cardRows,
    self,
  ] = await Promise.all([
    prisma.feishuMessageLog.count(),
    prisma.feishuMessageLog.count({
      where: { outcome: { startsWith: "handled" } },
    }),
    prisma.feishuMessageLog.count({
      where: { outcome: "needs_clarification" },
    }),
    prisma.cardActionLog.count({ where: { result: "ok" } }),
    prisma.feishuMessageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.cardActionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.user.findFirst({
      where: { id: currentUser.id },
      select: { feishuOpenId: true },
    }),
  ]);

  // 跟进详情单独批量取，避免用循环查询
  const followUpIds = logRows
    .map((row) => row.followUpId)
    .filter((id): id is string => Boolean(id));
  const followUps = followUpIds.length
    ? await prisma.followUp.findMany({
        where: { id: { in: followUpIds } },
        include: { customer: true, owner: true },
      })
    : [];
  const followUpMap = new Map(followUps.map((f) => [f.id, f]));

  const operatorIds = cardRows
    .map((row) => row.operatorUserId)
    .filter((id): id is string => Boolean(id));
  const operators = operatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: operatorIds } },
        select: { id: true, name: true },
      })
    : [];
  const operatorMap = new Map(operators.map((u) => [u.id, u.name]));

  const unboundUsers = isAdmin
    ? await prisma.user.findMany({
        where: { feishuOpenId: null },
        select: { id: true, name: true },
      })
    : [];

  return {
    selfBound: Boolean(self?.feishuOpenId),
    bot: {
      totalMessages,
      followUpsFromFeishu,
      clarifications,
      cardActions,
      recent: logRows.map((row) => {
        const followUp = row.followUpId
          ? followUpMap.get(row.followUpId)
          : undefined;
        return {
          messageId: row.messageId,
          outcome: row.outcome,
          createdAt: row.createdAt,
          followUp: followUp
            ? {
                content: followUp.content,
                mode: followUp.mode,
                customerName: followUp.customer?.name ?? null,
                ownerName: followUp.owner?.name ?? null,
                createdAt: followUp.createdAt,
              }
            : null,
        };
      }),
      recentCardActions: cardRows.map((row) => ({
        id: row.id,
        action: row.action,
        result: row.result,
        operatorName: row.operatorUserId
          ? (operatorMap.get(row.operatorUserId) ?? null)
          : null,
        createdAt: row.createdAt,
        targetType: row.targetType,
      })),
    },
    unboundUsers,
    modelReady,
    reminders: {
      batches: visibleReminders.length,
      items: visibleReminders.reduce((sum, b) => sum + b.total, 0),
      undeliverable: visibleReminders.filter((b) => !b.ownerOpenId).length,
    },
  };
}

/** 供调试/演示：按 open_id 查当前绑定的用户（首页提示用）。 */
export async function whoAmIOnFeishu(openId: string) {
  return getUserByFeishuOpenId(openId);
}
