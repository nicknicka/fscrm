import { prisma } from "@/lib/db/client";

/**
 * 飞书 OAuth state 的一次性存储（#46）。
 *
 * 浏览器的 state Cookie 仍是一次性防护的第一道；这里用数据库表补上
 * 「同一 state 只能消费一次」的共享、可持久保证：多实例部署下各实例
 * 共用同一张表，进程重启也不丢记录。
 *
 * 表结构见 `OAuthState`（prisma/schema.prisma）：`state` 唯一，`expiresAt`
 * 标记过期时间。消费通过 `deleteMany` 完成——删除到这一行才算消费成功，
 * 同时删除的行数天然让并发的重复消费里只有一个能成功（先删除者胜）。
 */

/** state 记录有效期，与登录路由下发的 state Cookie 有效期保持一致（10 分钟）。 */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * 登记一个待消费的 state。
 *
 * `state` 有唯一约束，重复登记会抛错——正常情况下 state 由 32 字节随机数
 * 生成，重复的概率可忽略。
 */
export async function issueOAuthState(
  state: string,
  now: Date = new Date()
): Promise<void> {
  await prisma.oAuthState.create({
    data: {
      state,
      expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
    },
  });
}

/**
 * 尝试一次性消费 state；返回是否消费成功。
 *
 * 只有存在且未过期、并被这次调用删掉的那一行才算成功：
 * - 未登记或已被消费 → `false`（重放）；
 * - 已过期 → `false`，并顺手删除该过期行。
 *
 * 每次调用都会顺手回收所有已过期记录，作为不依赖定时任务的清理手段。
 */
export async function consumeOAuthState(
  state: string,
  now: Date = new Date()
): Promise<boolean> {
  // 先清理过期记录（含本次要消费的 state 若已过期），再尝试删除未过期的那一行。
  await prisma.oAuthState.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const { count } = await prisma.oAuthState.deleteMany({
    where: { state, expiresAt: { gte: now } },
  });

  return count > 0;
}
