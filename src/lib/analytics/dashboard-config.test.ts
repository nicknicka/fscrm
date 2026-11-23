import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  dashboardConfig: { findUnique: vi.fn(), upsert: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import { getDashboardCards, saveDashboardCards } from "./dashboard-config";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("用户仪表盘配置服务", () => {
  it("无配置时返回默认卡片", async () => {
    prismaMock.dashboardConfig.findUnique.mockResolvedValue(null);

    const cards = await getDashboardCards("user_1");

    expect(cards).toContain("stat_customers");
    expect(cards).toContain("chart_trend");
  });

  it("有配置时按存储顺序返回，非法值被过滤", async () => {
    prismaMock.dashboardConfig.findUnique.mockResolvedValue({
      cards: ["chart_trend", "stat_leads", "BOGUS"],
    });

    const cards = await getDashboardCards("user_1");

    expect(cards).toEqual(["chart_trend", "stat_leads"]);
  });

  it("保存时按用户 upsert 且过滤非法 key", async () => {
    prismaMock.dashboardConfig.upsert.mockResolvedValue({});

    const cards = await saveDashboardCards("user_1", ["stat_leads", "hack"]);

    expect(cards).toEqual(["stat_leads"]);
    expect(prismaMock.dashboardConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        create: expect.objectContaining({
          userId: "user_1",
          cards: ["stat_leads"],
        }),
        update: expect.objectContaining({ cards: ["stat_leads"] }),
      })
    );
  });
});
