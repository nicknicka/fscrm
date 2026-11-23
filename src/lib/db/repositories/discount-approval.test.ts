import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  opportunity: { findFirst: vi.fn(), update: vi.fn() },
  discountApproval: {
    findMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  listDiscountApprovals,
  requestDiscountApproval,
  reviewDiscountApproval,
} from "./discount-approval";
import { BusinessObjectNotFoundError } from "./not-found";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const other = { id: "owner_2", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const opportunity = { id: "opp_1", name: "云启采购", amount: 100000 };
const pending = {
  id: "app_1",
  opportunityId: opportunity.id,
  discountRate: 0.1,
  reason: "大客户",
  requestedBy: owner.id,
  status: "PENDING",
  opportunity,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)
  );
  prismaMock.opportunity.findFirst.mockResolvedValue({ id: opportunity.id });
  prismaMock.discountApproval.create.mockResolvedValue(pending);
  prismaMock.discountApproval.findUnique.mockResolvedValue(pending);
  prismaMock.discountApproval.update.mockResolvedValue({
    ...pending,
    status: "APPROVED",
  });
  prismaMock.discountApproval.findMany.mockResolvedValue([pending]);
});

describe("折扣审批服务", () => {
  it("发起申请：商机必须在本人权限内", async () => {
    prismaMock.opportunity.findFirst.mockResolvedValue(null);
    await expect(
      requestDiscountApproval(
        "foreign",
        { discountRate: 0.1, reason: "x" },
        other
      )
    ).rejects.toBeInstanceOf(BusinessObjectNotFoundError);
    expect(prismaMock.discountApproval.create).not.toHaveBeenCalled();
  });

  it("发起申请：非法折扣率被拒绝", async () => {
    await expect(
      requestDiscountApproval(
        "opp_1",
        { discountRate: 1.5, reason: "x" },
        owner
      )
    ).rejects.toThrow("INVALID_INPUT");
    await expect(
      requestDiscountApproval("opp_1", { discountRate: 0, reason: "x" }, owner)
    ).rejects.toThrow("INVALID_INPUT");
  });

  it("列表按权限收窄：负责人仅本人相关，管理员全部", async () => {
    await listDiscountApprovals(owner);
    expect(prismaMock.discountApproval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { opportunity: { ownerId: owner.id } },
      })
    );
    await listDiscountApprovals(admin);
    expect(prismaMock.discountApproval.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it("审批通过：事务内记录原金额并按折扣调整商机金额", async () => {
    const result = await reviewDiscountApproval(
      "app_1",
      "APPROVED",
      "同意",
      admin.id
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.discountApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          originalAmount: 100000,
          reviewedBy: admin.id,
        }),
      })
    );
    expect(prismaMock.opportunity.update).toHaveBeenCalledWith({
      where: { id: opportunity.id },
      data: { amount: 90000 },
    });
    expect(result).toEqual(expect.objectContaining({ status: "APPROVED" }));
  });

  it("驳回不改商机金额", async () => {
    await reviewDiscountApproval("app_1", "REJECTED", "不行", admin.id);
    expect(prismaMock.opportunity.update).not.toHaveBeenCalled();
  });

  it("重复审批（非 PENDING）被拒绝", async () => {
    prismaMock.discountApproval.findUnique.mockResolvedValue({
      ...pending,
      status: "APPROVED",
    });
    await expect(
      reviewDiscountApproval("app_1", "APPROVED", "", admin.id)
    ).rejects.toBeInstanceOf(BusinessObjectNotFoundError);
    expect(prismaMock.discountApproval.update).not.toHaveBeenCalled();
  });
});
