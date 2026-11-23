import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  opportunityStageConfig: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  defaultStageConfigs,
  listStageConfigs,
  saveStageConfigs,
} from "./stage-config";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
    Promise.all(ops)
  );
  prismaMock.opportunityStageConfig.findMany.mockResolvedValue([]);
});

describe("销售阶段配置服务", () => {
  it("读取时按 position 排序，默认只取启用阶段", async () => {
    prismaMock.opportunityStageConfig.findMany.mockResolvedValue([
      {
        stage: "QUOTE",
        label: "报价",
        position: 2,
        isActive: true,
        tone: "amber",
      },
    ]);

    const configs = await listStageConfigs();

    expect(prismaMock.opportunityStageConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { position: "asc" },
      })
    );
    expect(configs).toEqual([
      {
        value: "QUOTE",
        label: "报价",
        position: 2,
        isActive: true,
        tone: "amber",
      },
    ]);
  });

  it("includeInactive 时不过滤", async () => {
    await listStageConfigs(true);
    expect(prismaMock.opportunityStageConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    );
  });

  it("默认配置为 6 个阶段", () => {
    const defaults = defaultStageConfigs();
    expect(defaults).toHaveLength(6);
    expect(defaults[0]).toEqual(
      expect.objectContaining({ value: "CONTACT", position: 1, isActive: true })
    );
  });

  it("保存时过滤枚举外的阶段，事务内先清空再写入", async () => {
    await saveStageConfigs([
      {
        stage: "CONTACT",
        label: "初次沟通",
        position: 1,
        isActive: true,
        tone: "blue",
      },
      {
        stage: "HACK",
        label: "非法",
        position: 2,
        isActive: true,
        tone: "blue",
      },
    ]);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.opportunityStageConfig.deleteMany).toHaveBeenCalled();
    expect(prismaMock.opportunityStageConfig.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.opportunityStageConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "CONTACT", label: "初次沟通" }),
      })
    );
  });
});
