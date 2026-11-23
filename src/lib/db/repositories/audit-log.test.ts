import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  auditLog: { create: vi.fn(), findMany: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import { auditActor, auditWrite, listAuditLogs } from "./audit-log";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({ id: "log_1" });
  prismaMock.auditLog.findMany.mockResolvedValue([]);
});

describe("业务审计日志", () => {
  it("actor 从会话构造姓名快照", () => {
    expect(auditActor(owner)).toEqual({
      actorId: owner.id,
      actorName: owner.name,
    });
  });

  it("写审计失败被吞掉，不影响业务", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.auditLog.create.mockRejectedValueOnce(new Error("db down"));
    await expect(
      auditWrite(owner, "CREATE", "Customer", "c1", "新建客户")
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("查询按权限收窄：负责人仅自己，管理员全部", async () => {
    await listAuditLogs(owner);
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorId: owner.id } })
    );
    await listAuditLogs(admin, { entityType: "Order", limit: 50 });
    expect(prismaMock.auditLog.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { entityType: "Order" },
        take: 50,
      })
    );
  });
});
