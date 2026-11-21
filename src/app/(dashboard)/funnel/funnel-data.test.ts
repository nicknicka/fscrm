import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  countOpportunitiesByStage: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  countOpportunitiesByStage: mocks.countOpportunitiesByStage,
}));

import { loadFunnelData } from "./funnel-data";
import type { CurrentUser } from "@/lib/auth/session";

const admin: CurrentUser = { id: "admin_1", name: "管理员", role: "ADMIN" };
const owner: CurrentUser = { id: "owner_1", name: "张三", role: "OWNER" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(admin);
  mocks.countOpportunitiesByStage.mockResolvedValue([]);
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
  });

  it("未登录时不查询商机数据", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(loadFunnelData()).rejects.toThrow("UNAUTHENTICATED");
    expect(mocks.countOpportunitiesByStage).not.toHaveBeenCalled();
  });
});
