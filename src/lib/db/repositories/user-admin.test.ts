import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import { grantAdmin, revokeAdmin, USER_NOT_FOUND, LAST_ADMIN } from "./user";

const owner = {
  id: "user_owner",
  name: "张三",
  role: "OWNER" as const,
  feishuOpenId: "ou_owner",
};
const admin = { ...owner, id: "user_admin", role: "ADMIN" as const };

/** 交互事务回调：把 mock 当作事务客户端直接回放，便于断言读写顺序。 */
const runTransaction = async (
  callback: (tx: typeof prismaMock) => Promise<unknown>
) => callback(prismaMock);

beforeEach(() => {
  for (const fn of Object.values(prismaMock.user)) fn.mockReset();
  prismaMock.$transaction.mockReset();
  prismaMock.$transaction.mockImplementation(runTransaction);
});

describe("管理员任免服务", () => {
  it("按内部 ID 找到已有负责人并任命为管理员，不创建用户", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(owner);
    prismaMock.user.update.mockResolvedValueOnce({ ...owner, role: "ADMIN" });

    await expect(grantAdmin({ id: owner.id })).resolves.toMatchObject({
      id: owner.id,
      role: "ADMIN",
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: owner.id },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: owner.id },
      data: { role: "ADMIN" },
    });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("按飞书 open_id 找到已有负责人并任命为管理员", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(owner);
    prismaMock.user.update.mockResolvedValueOnce({ ...owner, role: "ADMIN" });

    await expect(
      grantAdmin({ openId: owner.feishuOpenId })
    ).resolves.toMatchObject({
      id: owner.id,
      role: "ADMIN",
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { feishuOpenId: owner.feishuOpenId },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: owner.id },
      data: { role: "ADMIN" },
    });
  });

  it("撤销管理员后角色回落到普通负责人", async () => {
    prismaMock.user.count.mockResolvedValueOnce(2);
    prismaMock.user.findUnique.mockResolvedValueOnce(admin);
    prismaMock.user.update.mockResolvedValueOnce({ ...admin, role: "OWNER" });

    await expect(revokeAdmin({ id: admin.id })).resolves.toMatchObject({
      id: admin.id,
      role: "OWNER",
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: admin.id },
      data: { role: "OWNER" },
    });
  });

  it("按飞书 open_id 撤销管理员同样生效", async () => {
    prismaMock.user.count.mockResolvedValueOnce(2);
    prismaMock.user.findUnique.mockResolvedValueOnce(admin);
    prismaMock.user.update.mockResolvedValueOnce({ ...admin, role: "OWNER" });

    await expect(
      revokeAdmin({ openId: admin.feishuOpenId })
    ).resolves.toMatchObject({ id: admin.id, role: "OWNER" });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { feishuOpenId: admin.feishuOpenId },
    });
  });

  it("拒绝撤销最后一个管理员并保持角色不变", async () => {
    prismaMock.user.count.mockResolvedValueOnce(1);
    prismaMock.user.findUnique.mockResolvedValueOnce(admin);

    await expect(revokeAdmin({ id: admin.id })).rejects.toThrow(LAST_ADMIN);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("未知用户任命失败且不创建用户", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await expect(grantAdmin({ id: "missing" })).rejects.toThrow(USER_NOT_FOUND);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("未知用户撤销失败且不更新任何用户", async () => {
    prismaMock.user.count.mockResolvedValueOnce(2);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    await expect(revokeAdmin({ openId: "ou_missing" })).rejects.toThrow(
      USER_NOT_FOUND
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
