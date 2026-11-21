import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 联系人仓库权限测试：确认所有写入都按「所属客户」校验当前范围，
 * 拒绝时返回与对象不存在相同的 NOT_FOUND 结果。
 */

const prismaMock = vi.hoisted(() => ({
  customer: { findFirst: vi.fn() },
  contact: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import { createContact, deleteContact, updateContact } from "./contact";

const owner = { userId: "user_owner", role: "OWNER" as const };
const admin = { userId: "user_admin", role: "ADMIN" as const };
const input = {
  name: "王五",
  position: "采购经理",
  phone: "13800000000",
  email: "wang@example.com",
  remark: "决策人",
};
const notFound = { ok: false, error: "NOT_FOUND" };

describe("联系人仓库按所属客户鉴权", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.contact.create.mockResolvedValue({ id: "contact_1" });
    prismaMock.contact.update.mockResolvedValue({ id: "contact_1" });
    prismaMock.contact.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.contact.delete.mockResolvedValue({ id: "contact_1" });
    prismaMock.contact.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.contact.findUnique.mockResolvedValue({
      customerId: "customer_own",
    });
  });

  it("负责人只能在自己负责的客户下新建联系人", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "customer_own" });

    const result = await createContact("customer_own", input, owner);

    expect(result.ok).toBe(true);
    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "customer_own", ownerId: owner.userId },
      select: { id: true },
    });
    expect(prismaMock.contact.create).toHaveBeenCalled();
  });

  it("跨负责人新建联系人被拒绝，且返回与不存在一致的结果", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);

    const denied = await createContact("customer_foreign", input, owner);

    expect(denied).toEqual(notFound);
    expect(prismaMock.contact.create).not.toHaveBeenCalled();
  });

  it("编辑与删除联系人时按联系人所属客户校验范围", async () => {
    prismaMock.contact.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.contact.deleteMany.mockResolvedValue({ count: 0 });

    await expect(updateContact("contact_1", input, owner)).resolves.toEqual(
      notFound
    );
    await expect(deleteContact("contact_1", owner)).resolves.toEqual(notFound);
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
    expect(prismaMock.contact.delete).not.toHaveBeenCalled();
  });

  it("管理员不受负责人过滤，可维护任意客户的联系人", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "customer_foreign",
    });

    const created = await createContact("customer_foreign", input, admin);

    expect(created.ok).toBe(true);
    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "customer_foreign" },
      select: { id: true },
    });
  });

  it("联系人不存在时同样返回 NOT_FOUND", async () => {
    prismaMock.contact.findUnique.mockResolvedValue(null);

    await expect(deleteContact("contact_missing", admin)).resolves.toEqual(
      notFound
    );
    expect(prismaMock.contact.deleteMany).not.toHaveBeenCalled();
  });

  it("编辑联系人使用带负责人条件的原子写入，count 为 0 时返回 NOT_FOUND", async () => {
    const result = await updateContact("contact_1", input, owner);

    expect(result.ok).toBe(true);
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.contact.update).not.toHaveBeenCalled();
    expect(prismaMock.contact.updateMany).toHaveBeenCalledWith({
      where: {
        id: "contact_1",
        customer: { ownerId: owner.userId },
      },
      data: input,
    });

    prismaMock.contact.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateContact("contact_foreign", input, owner)).resolves.toEqual(
      notFound
    );
  });

  it("删除联系人使用带负责人条件的原子写入，count 为 0 时返回 NOT_FOUND", async () => {
    const result = await deleteContact("contact_1", owner);

    expect(result).toEqual({ ok: true, customerId: "customer_own" });
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.contact.delete).not.toHaveBeenCalled();
    expect(prismaMock.contact.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "contact_1",
        customer: { ownerId: owner.userId },
      },
    });

    prismaMock.contact.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteContact("contact_foreign", owner)).resolves.toEqual(
      notFound
    );
  });

  it("管理员编辑与删除时不附加负责人过滤", async () => {
    await updateContact("contact_1", input, admin);
    await deleteContact("contact_1", admin);

    expect(prismaMock.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "contact_1", customer: {} },
      data: input,
    });
    expect(prismaMock.contact.deleteMany).toHaveBeenCalledWith({
      where: { id: "contact_1", customer: {} },
    });
  });
});
