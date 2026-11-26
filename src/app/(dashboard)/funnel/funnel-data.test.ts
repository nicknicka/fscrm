import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  countOpportunitiesByStage: vi.fn(),
  loadWinRate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  countOpportunitiesByStage: mocks.countOpportunitiesByStage,
}));

vi.mock("@/lib/analytics/dashboard", () => ({
  loadWinRate: mocks.loadWinRate,
}));

vi.mock("@/lib/db/repositories/stage-config", () => ({
  listStageConfigs: vi.fn().mockResolvedValue([]),
}));

import { loadFunnelData } from "./funnel-data";
import type { CurrentUser } from "@/lib/auth/session";

const admin: CurrentUser = { id: "admin_1", name: "管理员", role: "ADMIN" };
const owner: CurrentUser = { id: "owner_1", name: "张三", role: "OWNER" };

const emptyWinRate = {
  wonAmount: 0,
  totalAmount: 0,
  wonCount: 0,
  totalCount: 0,
  rate: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(admin);
  mocks.countOpportunitiesByStage.mockResolvedValue([]);
  mocks.loadWinRate.mockResolvedValue(emptyWinRate);
});

describe("销售漏斗页面数据", () => {
  it("为每个销售阶段返回计数并按漏斗顺序补齐零计数阶段", async () => {
    mocks.countOpportunitiesByStage.mockResolvedValue([
      { stage: "NEGOTIATE", count: 4 },
      { stage: "WON", count: 2 },
    ]);

    const data = await loadFunnelData();

    expect(data.stages.map((entry) => entry.stage)).toEqual([
      "CONTACT",
      "NEED_CONFIRM",
      "QUOTE",
      "NEGOTIATE",
      "WON",
      "LOST",
    ]);
    expect(data.stages.map((entry) => entry.count)).toEqual([0, 0, 0, 4, 2, 0]);
    expect(data.total).toBe(6);
  });

  it("每个阶段的链接指向商机列表并带阶段筛选参数", async () => {
    const data = await loadFunnelData();

    expect(data.stages[0].href).toBe("/opportunities?stage=CONTACT");
    expect(data.stages[2].href).toBe("/opportunities?stage=QUOTE");
    expect(data.stages[5].href).toBe("/opportunities?stage=LOST");
  });

  it("以当前会话用户作为聚合范围，管理员和普通负责人由仓储层区分", async () => {
    mocks.requireCurrentUser.mockResolvedValue(owner);

    await loadFunnelData();

    expect(mocks.countOpportunitiesByStage).toHaveBeenCalledWith(owner);
    expect(mocks.loadWinRate).toHaveBeenCalledWith(owner);
  });

  it("未登录时不查询商机数据", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(loadFunnelData()).rejects.toThrow("UNAUTHENTICATED");
    expect(mocks.countOpportunitiesByStage).not.toHaveBeenCalled();
    expect(mocks.loadWinRate).not.toHaveBeenCalled();
  });
});

describe("销售漏斗顶部汇总", () => {
  it("复用 analytics 的赢单率结果，按金额口径返回金额与商机数", async () => {
    const winRate = {
      wonAmount: 300,
      totalAmount: 400,
      wonCount: 1,
      totalCount: 3,
      rate: 75,
    };
    mocks.loadWinRate.mockResolvedValue(winRate);

    const data = await loadFunnelData();

    expect(data.summary.winRate).toEqual(winRate);
  });

  it("阶段转化率按漏斗计数计算并保留一位小数，不含赢单/输单", async () => {
    mocks.countOpportunitiesByStage.mockResolvedValue([
      { stage: "CONTACT", count: 3 },
      { stage: "QUOTE", count: 1 },
      { stage: "WON", count: 1 },
      { stage: "LOST", count: 1 },
    ]);

    const data = await loadFunnelData();

    expect(data.summary.stageConversions).toEqual([
      { stage: "CONTACT", label: "已建立联系", count: 3, amount: 0, rate: 50 },
      {
        stage: "NEED_CONFIRM",
        label: "需求确认",
        count: 0,
        amount: 0,
        rate: 0,
      },
      { stage: "QUOTE", label: "报价", count: 1, amount: 0, rate: 16.7 },
      { stage: "NEGOTIATE", label: "谈判", count: 0, amount: 0, rate: 0 },
    ]);
  });

  it("没有商机时阶段转化率全部为 0，不产生 NaN", async () => {
    const data = await loadFunnelData();

    expect(data.total).toBe(0);
    expect(data.summary.stageConversions.every((item) => item.rate === 0)).toBe(
      true
    );
  });
});
