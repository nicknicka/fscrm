import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  salesTarget: { findMany: vi.fn(), upsert: vi.fn() },
  opportunity: { findMany: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  currentMonth,
  listSalesTargets,
  loadTargetBoard,
  setSalesTarget,
} from "./sales-target";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.salesTarget.findMany.mockResolvedValue([
    {
      userId: owner.id,
      month: "2026-11",
      amount: 100000,
      user: { id: owner.id, name: "张三" },
    },
  ]);
  prismaMock.opportunity.findMany.mockResolvedValue([
    { ownerId: owner.id, amount: 60000 },
  ]);
});

describe("业绩目标", () => {
  it("currentMonth 输出 YYYY-MM", () => {
    expect(currentMonth(new Date(2026, 10, 23))).toBe("2026-11");
  });

  it("读取目标按权限收窄：负责人仅自己，管理员全部", async () => {
    await listSalesTargets(owner, "2026-11");
    expect(prismaMock.salesTarget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: owner.id, month: "2026-11" }),
      })
    );

    await listSalesTargets(admin, "2026-11");
    expect(prismaMock.salesTarget.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { month: "2026-11" } })
    );
  });

  it("设置目标用 user+month 唯一键 upsert", async () => {
    await setSalesTarget(owner.id, "2026-11", 100000, "冲刺");
    expect(prismaMock.salesTarget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_month: { userId: owner.id, month: "2026-11" } },
        create: expect.objectContaining({ amount: 100000 }),
      })
    );
  });

  it("看板完成率 = 当月赢单金额 / 目标，日期为当月左闭右开", async () => {
    const board = await loadTargetBoard(owner, "2026-11");

    expect(board).toEqual([
      expect.objectContaining({ achieved: 60000, target: 100000, rate: 60 }),
    ]);
    const where = prismaMock.opportunity.findMany.mock.calls[0][0].where;
    expect(where.stage).toBe("WON");
    expect(where.createdAt.gte.getMonth()).toBe(10);
    expect(where.createdAt.lt.getMonth()).toBe(11);
  });

  it("目标为 0 时完成率为 0，不除零", async () => {
    prismaMock.salesTarget.findMany.mockResolvedValue([
      {
        userId: owner.id,
        month: "2026-11",
        amount: 0,
        user: { id: owner.id, name: "张三" },
      },
    ]);
    const board = await loadTargetBoard(owner, "2026-11");
    expect(board[0].rate).toBe(0);
  });
});
