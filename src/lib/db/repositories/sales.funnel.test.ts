import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  opportunity: {
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import { countOpportunitiesByStage } from "./sales";
import type { CurrentUser } from "@/lib/auth/session";

const admin: CurrentUser = { id: "admin_1", name: "管理员", role: "ADMIN" };
const owner: CurrentUser = { id: "owner_1", name: "张三", role: "OWNER" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("按销售阶段统计商机数量", () => {
  it("管理员实时聚合全部商机，并按阶段返回计数", async () => {
    prismaMock.opportunity.groupBy.mockResolvedValue([
      { stage: "CONTACT", _count: { _all: 3 }, _sum: { amount: 30000 } },
      { stage: "WON", _count: { _all: 1 }, _sum: { amount: 120000 } },
    ]);

    const counts = await countOpportunitiesByStage(admin);

    expect(prismaMock.opportunity.groupBy).toHaveBeenCalledWith({
      by: ["stage"],
      where: {},
      _count: { _all: true },
      _sum: { amount: true },
    });
    expect(counts).toEqual([
      { stage: "CONTACT", count: 3, amount: 30000 },
      { stage: "WON", count: 1, amount: 120000 },
    ]);
  });

  it("普通负责人只聚合本人负责商机的阶段计数", async () => {
    prismaMock.opportunity.groupBy.mockResolvedValue([
      { stage: "QUOTE", _count: { _all: 2 }, _sum: { amount: 50000 } },
    ]);

    const counts = await countOpportunitiesByStage(owner);

    expect(prismaMock.opportunity.groupBy).toHaveBeenCalledWith({
      by: ["stage"],
      where: { ownerId: owner.id },
      _count: { _all: true },
      _sum: { amount: true },
    });
    expect(counts).toEqual([{ stage: "QUOTE", count: 2, amount: 50000 }]);
  });

  it("没有商机时返回空数组，由上层补齐为零计数阶段", async () => {
    prismaMock.opportunity.groupBy.mockResolvedValue([]);

    await expect(countOpportunitiesByStage(owner)).resolves.toEqual([]);
  });
});
