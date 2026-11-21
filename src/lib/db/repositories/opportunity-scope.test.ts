import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  opportunity: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  customer: {
    findFirst: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  createOpportunity,
  deleteOpportunity,
  getOpportunity,
  listOpportunities,
  listAssignableOpportunityOwners,
  updateOpportunity,
} from "./sales";

const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };
const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const other = { id: "owner_2", name: "李四", role: "OWNER" as const };

const opportunity = (id: string, ownerId: string | null) => ({
  id,
  ownerId,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("商机权限范围", () => {
  it("管理员可以看到全部商机，普通负责人仅看到本人负责商机", async () => {
    prismaMock.opportunity.findMany.mockResolvedValue([]);

    await listOpportunities({}, admin);
    await listOpportunities({}, owner);

    expect(prismaMock.opportunity.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: {} })
    );
    expect(prismaMock.opportunity.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { ownerId: owner.id } })
    );
  });

  it("普通负责人不能通过额外 ownerId 参数查看他人商机", async () => {
    prismaMock.opportunity.findMany.mockResolvedValue([]);

    await listOpportunities({ ownerId: other.id }, owner);

    expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: owner.id } })
    );
  });

  it("商机详情对普通负责人按负责人收窄，对管理员开放", async () => {
    prismaMock.opportunity.findFirst.mockResolvedValue(null);

    await getOpportunity("opp_1", owner);
    await getOpportunity("opp_1", admin);

    expect(prismaMock.opportunity.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: "opp_1", ownerId: owner.id }),
      })
    );
    expect(prismaMock.opportunity.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: "opp_1" }),
      })
    );
    expect(prismaMock.opportunity.findFirst.mock.calls[1][0].where).not.toHaveProperty(
      "ownerId"
    );
  });

  it("越权详情返回 null，不泄露商机存在性", async () => {
    prismaMock.opportunity.findFirst.mockResolvedValue(null);

    await expect(getOpportunity("someone_else", owner)).resolves.toBeNull();
  });

  it("普通负责人创建商机时强制归属本人，并校验关联客户在权限范围内", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "customer_1" });
    prismaMock.opportunity.create.mockImplementation(async ({ data }) => data);

    await createOpportunity(
      {
        customer: { connect: { id: "customer_1" } },
        name: "年度采购合同",
        owner: { connect: { id: other.id } },
      },
      owner
    );

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "customer_1", ownerId: owner.id },
      select: { id: true },
    });
    expect(prismaMock.opportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customer: { connect: { id: "customer_1" } },
        owner: { connect: { id: owner.id } },
      }),
    });
  });

  it("普通负责人不能基于无权客户创建商机", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);

    await expect(
      createOpportunity(
        {
          customer: { connect: { id: "foreign_customer" } },
          name: "越权商机",
        },
        owner
      )
    ).rejects.toThrow("FORBIDDEN");
    expect(prismaMock.opportunity.create).not.toHaveBeenCalled();
  });

  it("管理员创建商机可选择实际负责人并使用该负责人发送通知", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "customer_1" });
    prismaMock.opportunity.create.mockImplementation(async ({ data }) => ({
      id: "opp_1",
      ...data,
    }));

    await createOpportunity(
      {
        customer: { connect: { id: "customer_1" } },
        name: "年度采购合同",
        owner: { connect: { id: other.id } },
      },
      admin
    );

    expect(prismaMock.opportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: { connect: { id: other.id } },
      }),
    });
  });

  it("阶段更新与删除按当前负责人收窄，越权操作不执行", async () => {
    prismaMock.opportunity.update.mockResolvedValue(opportunity("opp_1", owner.id));
    prismaMock.opportunity.delete.mockResolvedValue(opportunity("opp_1", owner.id));

    await updateOpportunity("opp_1", { stage: "WON" }, owner);
    await deleteOpportunity("opp_1", owner);

    expect(prismaMock.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "opp_1", ownerId: owner.id }),
      })
    );
    expect(prismaMock.opportunity.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "opp_1", ownerId: owner.id }),
      })
    );

    prismaMock.opportunity.update.mockRejectedValue(
      Object.assign(new Error("no record"), { code: "P2025" })
    );
    prismaMock.opportunity.delete.mockRejectedValue(
      Object.assign(new Error("no record"), { code: "P2025" })
    );

    await expect(
      updateOpportunity("someone_else", { stage: "WON" }, owner)
    ).rejects.toThrow("FORBIDDEN");
    await expect(deleteOpportunity("someone_else", owner)).rejects.toThrow(
      "FORBIDDEN"
    );
  });

  it("管理员可更新或删除任意商机的阶段和归属", async () => {
    prismaMock.opportunity.update.mockResolvedValue(opportunity("opp_2", other.id));
    prismaMock.opportunity.delete.mockResolvedValue(opportunity("opp_2", other.id));

    await updateOpportunity(
      "opp_2",
      { stage: "NEGOTIATE", owner: { connect: { id: admin.id } } },
      admin
    );
    await deleteOpportunity("opp_2", admin);

    expect(prismaMock.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "opp_2" } })
    );
    expect(prismaMock.opportunity.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "opp_2" } })
    );
  });

  it("负责人选择只返回本人；管理员可移交时看到全部负责人", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await listAssignableOpportunityOwners(owner);
    await listAssignableOpportunityOwners(admin);

    expect(prismaMock.user.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: owner.id } })
    );
    expect(prismaMock.user.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: {} })
    );
    expect(prismaMock.user.findMany.mock.calls[1][0].where).not.toHaveProperty(
      "role"
    );
  });
});
