import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  salesTask: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  createSalesTask,
  deleteSalesTask,
  listOverdueTasks,
  listSalesTasks,
  setSalesTaskStatus,
} from "./sales-task";
import { BusinessObjectNotFoundError } from "./not-found";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };
const task = {
  id: "task_1",
  title: "回访客户",
  type: "TASK",
  status: "OPEN",
  dueAt: new Date("2026-11-20T00:00:00Z"),
  ownerId: owner.id,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.salesTask.findMany.mockResolvedValue([task]);
  prismaMock.salesTask.create.mockResolvedValue(task);
  prismaMock.salesTask.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.salesTask.deleteMany.mockResolvedValue({ count: 1 });
});

describe("任务与日程服务", () => {
  it("列表按权限收窄：负责人仅自己，管理员全部", async () => {
    await listSalesTasks(owner);
    expect(prismaMock.salesTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: owner.id } })
    );
    await listSalesTasks(admin);
    expect(prismaMock.salesTask.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it("新建任务按已解析负责人写入，并保留来源跟进 ID", async () => {
    await createSalesTask(
      {
        type: "TASK",
        title: "x",
        description: null,
        dueAt: task.dueAt,
        customerId: null,
        opportunityId: null,
        followUpId: "followup_1",
      },
      "resolved_owner"
    );
    expect(prismaMock.salesTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "resolved_owner",
          followUpId: "followup_1",
        }),
      })
    );
  });

  it("状态切换与删除带权限条件，越权时 NOT_FOUND", async () => {
    prismaMock.salesTask.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      setSalesTaskStatus("foreign", "DONE", owner)
    ).rejects.toBeInstanceOf(BusinessObjectNotFoundError);
    prismaMock.salesTask.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteSalesTask("foreign", owner)).rejects.toBeInstanceOf(
      BusinessObjectNotFoundError
    );
  });

  it("逾期扫描只取未完成且时间已过的任务", async () => {
    const now = new Date("2026-11-22T00:00:00Z");
    await listOverdueTasks(now);
    expect(prismaMock.salesTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "OPEN", dueAt: { lt: now } },
      })
    );
  });
});
