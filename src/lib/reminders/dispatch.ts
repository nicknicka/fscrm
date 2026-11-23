import { reminderCard } from "@/lib/feishu/cards/templates";
import { sendCard } from "@/lib/feishu/bot/sender";
import { scanReminders, type ReminderBatch } from "./scan";

/**
 * 把扫描出的提醒推送到飞书。
 *
 * 与扫描分离：扫描是纯只读，推送带副作用。这样网页端可以「先看再推」，
 * 定时任务可以「扫完就推」，两条路径共用同一份数据。
 */

/** 推送结果。 */
export interface DispatchResult {
  scanned: number;
  sent: number;
  skippedUnbound: number;
  failed: number;
  scannedAt: Date;
}

/**
 * 扫描并推送。
 *
 * 一个负责人一天可能同时收到「跟进超期」和「待回款」两张卡——这是有意的，
 * 两类事的处理方式不同（一个是打电话、一个是催款），合并反而看不清。
 * 但同类一定聚合成一张，不会按客户逐条发。
 */
export async function dispatchReminders(
  now: Date = new Date()
): Promise<DispatchResult> {
  const { batches, scannedAt } = await scanReminders(now);

  let sent = 0;
  let failed = 0;
  let skippedUnbound = 0;

  // 逐张发送：单张失败不影响其余的，也不会因为一个未绑定的负责人中断整批
  for (const batch of batches) {
    if (!batch.ownerOpenId) {
      skippedUnbound += 1;
      continue;
    }
    const result = await sendCard(
      batch.ownerOpenId,
      reminderCard({
        kind: batch.kind,
        ownerName: batch.ownerName,
        items: batch.items,
        total: batch.total,
      })
    );
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return {
    scanned: batches.length,
    sent,
    skippedUnbound,
    failed,
    scannedAt,
  };
}

/** 只推送指定负责人的提醒（管理员在页面上单点某人时用）。 */
export async function dispatchRemindersForOwner(
  ownerId: string,
  now: Date = new Date()
): Promise<DispatchResult> {
  const { batches, scannedAt } = await scanReminders(now);
  const mine: ReminderBatch[] = batches.filter((b) => b.ownerId === ownerId);

  let sent = 0;
  let failed = 0;
  let skippedUnbound = 0;

  for (const batch of mine) {
    if (!batch.ownerOpenId) {
      skippedUnbound += 1;
      continue;
    }
    const result = await sendCard(
      batch.ownerOpenId,
      reminderCard({
        kind: batch.kind,
        ownerName: batch.ownerName,
        items: batch.items,
        total: batch.total,
      })
    );
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return {
    scanned: mine.length,
    sent,
    skippedUnbound,
    failed,
    scannedAt,
  };
}
