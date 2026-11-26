import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  opportunityStageConfig: { findMany: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import { loadStageDisplays, loadStageLabelMap } from "./stage-display";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.opportunityStageConfig.findMany.mockResolvedValue([]);
});

describe("阶段展示读取", () => {
  it("配置表为空时回落默认阶段", async () => {
    const displays = await loadStageDisplays();
    expect(displays).toHaveLength(6);
    expect(displays[0].label).toBe("已建立联系");
  });

  it("配置存在时使用管理员配置的显示名", async () => {
    prismaMock.opportunityStageConfig.findMany.mockResolvedValue([
      {
        stage: "NEGOTIATE",
        label: "商务谈判（自定义）",
        position: 1,
        isActive: true,
        tone: "blue",
      },
    ]);
    const labels = await loadStageLabelMap();
    expect(labels.NEGOTIATE).toBe("商务谈判（自定义）");
  });
});
