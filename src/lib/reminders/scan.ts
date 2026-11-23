import { prisma } from "@/lib/db/client";
import { UserRole } from "@/generated/prisma/enums";

/**
 * 「主动驱动」扫描：找出需要负责人现在处理的事。
 *
 * 与「机器人被动回答」互补：销售不会主动想起来去查系统，
 * 所以要由系统定期把待办推到飞书。三类信号：
 *
 * 1. **跟进超期**：上次跟进登记的「下一步时间」已过，还没跟进；
 * 2. **客户沉默**：负责的客户超过 N 天没有任何跟进；
 * 3. **待回款**：订单还有未收差额。
 *
 * 每类都按**负责人**聚合成一条提醒（而不是每个对象一条），
 * 否则一个负责人有 20 个沉默客户就会被 20 条消息淹没——这是提醒功能最常见的失败方式。
 */

/** 默认阈值，可按需调整。 */
export const REMINDER_DEFAULTS = {
  /** 客户超过多少天没有跟进视为沉默。 */
  silentCustomerDays: 14,
  /** 跟进超期：容差天数（当天到期的不算超期）。 */
  followUpGraceDays: 0,
  /** 每类提醒最多列出多少条明细，避免卡片过长。 */
  maxItemsPerCard: 5,
} as const;

/** 一条待办明细。 */
export interface ReminderItem {
  id: string;
  title: string;
  /** 补充说明，如「超期 3 天」。 */
  detail: string;
  /** 金额（回款类），用于卡片展示。 */
  amount?: number;
  /** 客户 ID，用于按钮动作。 */
  customerId?: string;
}

/** 一类提醒：一个负责人 + 一类信号。 */
export interface ReminderBatch {
  ownerId: string;
  ownerName: string;
  ownerOpenId: string | null;
  kind: "followup_overdue" | "customer_silent" | "payment_due" | "task_due";
  items: ReminderItem[];
  /** 该类别的总条数（明细可能被截断）。 */
  total: number;
}

/** 扫描结果。 */
export interface ReminderScanResult {
  batches: ReminderBatch[];
  /** 因为没有绑定飞书而跳过的提醒条数。 */
  skippedUnbound: number;
  scannedAt: Date;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** 只统计绑定且为普通负责人的用户？不——管理员也可能自己负责客户，一并纳入。 */
async function loadOwnersWithOpenId(
  ownerIds: string[]
): Promise<Map<string, { name: string; openId: string | null }>> {
  if (ownerIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true, feishuOpenId: true, role: true },
  });
  return new Map(
    users.map((u) => [
      u.id,
      {
        name: u.name,
        openId: u.feishuOpenId,
      },
    ])
  );
}

/** 把明细按负责人分组，并限制每类最多 N 条。 */
function groupByOwner(
  rows: { ownerId: string; item: ReminderItem }[],
  kind: ReminderBatch["kind"],
  owners: Map<string, { name: string; openId: string | null }>
): ReminderBatch[] {
  const grouped = new Map<string, ReminderItem[]>();
  for (const row of rows) {
    const list = grouped.get(row.ownerId) ?? [];
    list.push(row.item);
    grouped.set(row.ownerId, list);
  }

  return Array.from(grouped.entries()).map(([ownerId, items]) => {
    const owner = owners.get(ownerId);
    return {
      ownerId,
      ownerName: owner?.name ?? "未命名负责人",
      ownerOpenId: owner?.openId ?? null,
      kind,
      items: items.slice(0, REMINDER_DEFAULTS.maxItemsPerCard),
      total: items.length,
    };
  });
}

/**
 * 扫描全部三类提醒。
 *
 * 只读，不写任何业务数据；发送与否由调用方决定，便于单独预览。
 */
export async function scanReminders(
  now: Date = new Date(),
  options: Partial<typeof REMINDER_DEFAULTS> = {}
): Promise<ReminderScanResult> {
  const config = { ...REMINDER_DEFAULTS, ...options };

  const graceDate = new Date(
    now.getTime() - config.followUpGraceDays * 86_400_000
  );
  const silentDate = new Date(
    now.getTime() - config.silentCustomerDays * 86_400_000
  );

  const [overdueFollowUps, silentCustomers, unpaidOrders, overdueTasks] =
    await Promise.all([
      // 跟进超期：登记了下一步时间、已经过了、且之后没有新的跟进
      prisma.followUp.findMany({
        where: {
          nextFollowUpAt: { lt: graceDate, not: null },
          ownerId: { not: null },
          customerId: { not: null },
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: 200,
        include: { customer: { select: { id: true, name: true } } },
      }),

      // 客户沉默：有负责人、且该客户最近一次跟进早于阈值（或从未跟进）
      prisma.customer.findMany({
        where: {
          ownerId: { not: null },
          lifecycle: { notIn: ["CHURNED"] },
        },
        take: 300,
        include: {
          owner: { select: { id: true, name: true, feishuOpenId: true } },
          followUps: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),

      // 待回款：订单未取消且有差额
      prisma.order.findMany({
        where: { status: { notIn: ["CANCELLED"] } },
        take: 200,
        include: {
          customer: { select: { id: true, name: true, ownerId: true } },
          payments: { select: { amount: true } },
          paymentPlans: {
            select: { plannedAt: true, amount: true },
            orderBy: { plannedAt: "asc" },
          },
        },
      }),

      // 逾期任务/日程：未完成且计划时间已过
      prisma.salesTask.findMany({
        where: { status: "OPEN", dueAt: { lt: now } },
        select: {
          id: true,
          title: true,
          dueAt: true,
          ownerId: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 200,
      }),
    ]);

  const ownerIds = new Set<string>();

  // 1. 跟进超期
  const overdueRows: { ownerId: string; item: ReminderItem }[] = [];
  // 同一客户可能有多条超期记录，只保留最早那条，避免同一客户刷屏
  const seenCustomer = new Set<string>();
  for (const followUp of overdueFollowUps) {
    if (!followUp.ownerId || !followUp.customer) continue;
    // 如果这个客户之后又有新的跟进，说明已经处理过了
    const later = await prisma.followUp.findFirst({
      where: {
        customerId: followUp.customerId,
        createdAt: { gt: followUp.createdAt },
      },
      select: { id: true },
    });
    if (later) continue;
    if (seenCustomer.has(followUp.customerId as string)) continue;
    seenCustomer.add(followUp.customerId as string);

    ownerIds.add(followUp.ownerId);
    const overdueDays = daysBetween(followUp.nextFollowUpAt as Date, now);
    overdueRows.push({
      ownerId: followUp.ownerId,
      item: {
        id: followUp.id,
        title: followUp.customer.name,
        detail:
          overdueDays > 0 ? `承诺的下一步已超期 ${overdueDays} 天` : "今天到期",
        customerId: followUp.customer.id,
      },
    });
  }

  // 2. 客户沉默
  const silentRows: { ownerId: string; item: ReminderItem }[] = [];
  for (const customer of silentCustomers) {
    if (!customer.ownerId) continue;
    const last = customer.followUps[0]?.createdAt ?? customer.createdAt;
    if (last > silentDate) continue;
    ownerIds.add(customer.ownerId);
    const days = daysBetween(last, now);
    silentRows.push({
      ownerId: customer.ownerId,
      item: {
        id: customer.id,
        title: customer.name,
        detail:
          customer.followUps.length === 0
            ? "还没有任何跟进记录"
            : `${days} 天没有跟进了`,
        customerId: customer.id,
      },
    });
  }

  // 3. 待回款
  const paymentRows: { ownerId: string; item: ReminderItem }[] = [];
  for (const order of unpaidOrders) {
    const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    const balance = order.amount - paid;
    if (balance <= 0.01) continue;
    const ownerId = order.customer.ownerId;
    if (!ownerId) continue;
    ownerIds.add(ownerId);
    const plans =
      (order as { paymentPlans?: { plannedAt: Date; amount: number }[] })
        .paymentPlans ?? [];
    const nextPlan = plans.find((p) => p.plannedAt >= now) ?? plans[0];
    const planHint = nextPlan
      ? `；计划 ${nextPlan.plannedAt.toLocaleDateString("zh-CN")} 收 ¥${nextPlan.amount.toLocaleString("zh-CN")}`
      : "";
    paymentRows.push({
      ownerId,
      item: {
        id: order.id,
        title: order.customer.name,
        detail: `订单已收 ¥${paid.toLocaleString("zh-CN")}，还差 ¥${balance.toLocaleString("zh-CN")}${planHint}`,
        amount: balance,
        customerId: order.customer.id,
      },
    });
  }

  // 4. 逾期任务/日程
  const taskRows: { ownerId: string; item: ReminderItem }[] = [];
  for (const task of overdueTasks) {
    if (!task.ownerId) continue;
    ownerIds.add(task.ownerId);
    taskRows.push({
      ownerId: task.ownerId,
      item: {
        id: task.id,
        title: task.title,
        detail: `计划 ${task.dueAt.toLocaleString("zh-CN")} 已过${task.customer ? ` · ${task.customer.name}` : ""}`,
        customerId: task.customer?.id,
      },
    });
  }

  const owners = await loadOwnersWithOpenId(Array.from(ownerIds));

  // 沉默客户按「沉默最久」排在前面更合理，这里按明细数排序
  const batches = [
    ...groupByOwner(overdueRows, "followup_overdue", owners),
    ...groupByOwner(silentRows, "customer_silent", owners),
    ...groupByOwner(paymentRows, "payment_due", owners),
    ...groupByOwner(taskRows, "task_due", owners),
  ];

  const skippedUnbound = batches.filter((b) => !b.ownerOpenId).length;

  return { batches, skippedUnbound, scannedAt: now };
}

/** 组装扫描结果里所有负责人（去重），便于一次批量发送。 */
export function uniqueOwners(batches: ReminderBatch[]): {
  ownerId: string;
  ownerName: string;
  ownerOpenId: string | null;
}[] {
  const map = new Map<
    string,
    { ownerId: string; ownerName: string; ownerOpenId: string | null }
  >();
  for (const batch of batches) {
    map.set(batch.ownerId, {
      ownerId: batch.ownerId,
      ownerName: batch.ownerName,
      ownerOpenId: batch.ownerOpenId,
    });
  }
  return Array.from(map.values());
}

export { UserRole };
