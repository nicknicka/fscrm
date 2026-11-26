import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  opportunity: { groupBy: vi.fn(), findMany: vi.fn() },
  customer: { groupBy: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

vi.mock("@/lib/db/repositories/sales", () => ({
  countOpportunitiesByStage: vi.fn(),
}));

vi.mock("@/lib/db/repositories/stage-config", () => ({
  listStageConfigs: vi.fn().mockResolvedValue([]),
}));

import { countOpportunitiesByStage } from "@/lib/db/repositories/sales";
import {
  loadCustomerLevelDistribution,
  loadOpportunityTrend,
  loadStageDistribution,
  loadWinRate,
} from "./dashboard";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(countOpportunitiesByStage).mockResolvedValue([
    { stage: "QUOTE" as never, count: 3, amount: 0 },
  ]);
  prismaMock.opportunity.findMany.mockResolvedValue([]);
  prismaMock.customer.groupBy.mockResolvedValue([]);
});

describe("销售分析数据层", () => {
  it("阶段分布复用漏斗聚合，按漏斗阶段顺序输出，缺失阶段记 0", async () => {
    const data = await loadStageDistribution(owner);

    expect(countOpportunitiesByStage).toHaveBeenCalledWith(owner);
    expect(data[0]).toEqual(expect.objectContaining({ count: 0 }));
    const quote = data.find((d) => d.stage === "QUOTE");
    expect(quote?.count).toBe(3);
  });

  it("趋势按权限收窄且按月归档，空数据月份补 0", async () => {
    const now = new Date();
    prismaMock.opportunity.findMany.mockResolvedValue([
      { createdAt: now, amount: 100 },
      { createdAt: now, amount: null },
    ]);

    const data = await loadOpportunityTrend(owner, 3);

    expect(data).toHaveLength(3);
    expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: owner.id }),
      })
    );
    const totalCount = data.reduce((sum, d) => sum + d.count, 0);
    const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
    expect(totalCount).toBe(2);
    expect(totalAmount).toBe(100);
  });

  it("管理员趋势不限定负责人", async () => {
    await loadOpportunityTrend(admin, 1);
    expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ ownerId: expect.anything() }),
      })
    );
  });

  it("客户等级分布按权限收窄并映射中文标签", async () => {
    prismaMock.customer.groupBy.mockResolvedValue([
      { level: "HIGH", _count: { _all: 5 } },
    ]);

    const data = await loadCustomerLevelDistribution(owner);

    expect(prismaMock.customer.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: owner.id }),
      })
    );
    expect(data).toEqual([{ level: "HIGH", label: "高价值", count: 5 }]);
  });
});

describe("赢单率（金额口径）", () => {
  it("按赢单金额/全部金额计算，保留一位小数", async () => {
    prismaMock.opportunity.findMany.mockResolvedValue([
      { stage: "WON", amount: 300 },
      { stage: "QUOTE", amount: 100 },
      { stage: "CONTACT", amount: null },
    ]);

    const result = await loadWinRate(owner);

    expect(result).toEqual(
      expect.objectContaining({
        wonAmount: 300,
        totalAmount: 400,
        wonCount: 1,
        totalCount: 3,
        rate: 75,
      })
    );
    expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: owner.id }),
      })
    );
  });

  it("无金额或无商机时赢单率为 0，不产生 NaN", async () => {
    prismaMock.opportunity.findMany.mockResolvedValue([
      { stage: "WON", amount: null },
      { stage: "CONTACT", amount: null },
    ]);
    expect((await loadWinRate(owner)).rate).toBe(0);

    prismaMock.opportunity.findMany.mockResolvedValue([]);
    expect((await loadWinRate(owner)).rate).toBe(0);
  });

  it("管理员不限定负责人", async () => {
    prismaMock.opportunity.findMany.mockResolvedValue([]);
    await loadWinRate(admin);
    expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ ownerId: expect.anything() }),
      })
    );
  });
});
