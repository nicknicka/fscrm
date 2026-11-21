import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OAuth state 一次性存储（#46）。
 *
 * 这里用一个假的 Prisma 客户端替身验证存储的行为契约：登记、原子消费、
 * 过期拒绝、过期记录回收。真实表结构由 Prisma 迁移保证，集成层面由
 * `prisma/schema.prisma` 与迁移链背书。
 */

const mocks = vi.hoisted(() => {
  const rows = new Map<
    string,
    { id: string; state: string; expiresAt: Date; consumedAt: Date | null }
  >();
  let sequence = 0;
  return {
    rows,
    reset() {
      rows.clear();
      sequence = 0;
    },
    nextId() {
      sequence += 1;
      return `row_${sequence}`;
    },
    build() {
      return {
        oAuthState: {
          create: vi.fn(async ({ data }: { data: { state: string; expiresAt: Date } }) => {
            if (rows.has(data.state)) {
              throw new Error("Unique constraint failed on the fields: (`state`)");
            }
            const row = {
              id: `row_${(sequence += 1)}`,
              state: data.state,
              expiresAt: data.expiresAt,
              consumedAt: null,
            };
            rows.set(data.state, row);
            return row;
          }),
          findUnique: vi.fn(async ({ where }: { where: { state: string } }) => {
            return rows.get(where.state) ?? null;
          }),
          deleteMany: vi.fn(
            async ({
              where,
            }: {
              where: { state?: string; expiresAt?: { lt?: Date; gte?: Date } };
            }) => {
              // Prisma 的 where 各字段是「与」关系；这里只实现实现用到的
              // `state` 与 `expiresAt.lt` / `expiresAt.gte` 比较。
              let count = 0;
              for (const [key, row] of rows) {
                const matchesState = where.state === undefined || key === where.state;
                const matchesLt =
                  !where.expiresAt?.lt || row.expiresAt < where.expiresAt.lt;
                const matchesGte =
                  !where.expiresAt?.gte || row.expiresAt >= where.expiresAt.gte;
                if (!matchesState || !matchesLt || !matchesGte) continue;
                rows.delete(key);
                count += 1;
              }
              return { count };
            }
          ),
        },
      };
    },
  };
});

vi.mock("@/lib/db/client", () => ({ prisma: mocks.build() }));

import { prisma } from "@/lib/db/client";
import {
  consumeOAuthState,
  issueOAuthState,
  OAUTH_STATE_TTL_MS,
} from "./oauth-state";

const store = prisma.oAuthState;

describe("OAuth state 一次性存储", () => {
  beforeEach(() => {
    mocks.reset();
    // 只重置调用记录，不能清掉替身的实现（vi.clearAllMocks 会清空实现）。
    vi.mocked(store.create).mockClear();
    vi.mocked(store.findUnique).mockClear();
    vi.mocked(store.deleteMany).mockClear();
  });

  it("登记 state 并写入带过期时间的记录", async () => {
    const before = Date.now();
    await issueOAuthState("state-1");
    const after = Date.now();

    expect(store.create).toHaveBeenCalledTimes(1);
    const row = mocks.rows.get("state-1");
    expect(row).toBeDefined();
    expect(row!.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + OAUTH_STATE_TTL_MS
    );
    expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(after + OAUTH_STATE_TTL_MS);
  });

  it("首次消费成功，第二次消费同一 state 被拒绝（重放）", async () => {
    await issueOAuthState("state-2");

    await expect(consumeOAuthState("state-2")).resolves.toBe(true);
    await expect(consumeOAuthState("state-2")).resolves.toBe(false);
  });

  it("未登记过的 state 消费被拒绝", async () => {
    await expect(consumeOAuthState("never-issued")).resolves.toBe(false);
  });

  it("过期 state 消费被拒绝，并被顺手删除", async () => {
    await issueOAuthState("state-3");
    // 直接把记录改成已过期，模拟 min
    const row = mocks.rows.get("state-3")!;
    row.expiresAt = new Date(Date.now() - 1000);

    await expect(consumeOAuthState("state-3")).resolves.toBe(false);
    expect(mocks.rows.has("state-3")).toBe(false);
  });

  it("消费时回收已过期的记录", async () => {
    await issueOAuthState("stale");
    mocks.rows.get("stale")!.expiresAt = new Date(Date.now() - 60_000);
    await issueOAuthState("fresh");

    await consumeOAuthState("fresh");

    expect(mocks.rows.has("stale")).toBe(false);
    expect(mocks.rows.has("fresh")).toBe(false);
  });

  it("拒绝重放时不消耗掉一次成功的消费（并发语义：先删除者胜）", async () => {
    await issueOAuthState("state-4");

    const [first, second] = await Promise.all([
      consumeOAuthState("state-4"),
      consumeOAuthState("state-4"),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });
});
