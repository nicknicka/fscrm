import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #34 报价仓储外部行为测试。
 *
 * 测试只经过报价仓储这一公开接缝：创建/编辑的结果、条目金额汇总、
 * 负责人与管理员范围，以及越权时统一不泄露存在性的拒绝结果。
 */

const prismaMock = vi.hoisted(() => ({
  quotation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  customer: { findFirst: vi.fn() },
  opportunity: { findFirst: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  QuotationNotFoundError,
  createQuotation,
  getQuotation,
  listQuotations,
  updateQuotation,
} from "./quotation";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const scope = (user: typeof owner | typeof admin) => ({
  userId: user.id,
  role: user.role,
});

function items(values: Array<[string, number, number]>) {
  return values.map(([name, quantity, unitPrice]) => ({
    name,
    quantity,
    unitPrice,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("报价仓储", () => {
  it("创建报价时保存多个条目，并从条目汇总金额", async () => {
    const created = {
      id: "quotation_1",
      customerId: "customer_own",
      opportunityId: "opportunity_own",
      status: "DRAFT",
      amount: 275,
      items: [
        { id: "item_1", name: "咨询", quantity: 5, unitPrice: 40 },
        { id: "item_2", name: "部署", quantity: 1, unitPrice: 75 },
      ],
    };
    prismaMock.customer.findFirst.mockResolvedValue({ id: "customer_own" });
    prismaMock.opportunity.findFirst.mockResolvedValue({
      id: "opportunity_own",
    });
    prismaMock.quotation.create.mockImplementation(async ({ data }) => ({
      ...created,
      ...data,
      items: created.items,
    }));

    const result = await createQuotation(
      {
        opportunityId: "opportunity_own",
        items: items([
          ["咨询", 5, 40],
          ["部署", 1, 75],
        ]),
      },
      scope(owner)
    );

    expect(prismaMock.quotation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 275,
          status: "DRAFT",
          customer: { connect: { id: "customer_own" } },
          opportunity: { connect: { id: "opportunity_own" } },
          items: {
            create: [
              { name: "咨询", quantity: 5, unitPrice: 40 },
              { name: "部署", quantity: 1, unitPrice: 75 },
            ],
          },
        }),
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: "quotation_1" }));
  });

  it("编辑报价条目后重算金额并替换原有条目", async () => {
    prismaMock.quotation.findFirst.mockResolvedValue({
      id: "quotation_1",
      customerId: "customer_own",
      opportunityId: "opportunity_own",
    });
    prismaMock.quotation.update.mockImplementation(async ({ data }) => ({
      id: "quotation_1",
      ...data,
    }));

    await updateQuotation(
      "quotation_1",
      {
        status: "CONFIRMED",
        items: items([
          ["咨询", 10, 30],
          ["运维", 2, 100],
        ]),
      },
      scope(owner)
    );

    expect(prismaMock.quotation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 500,
          status: "CONFIRMED",
          items: {
            deleteMany: {},
            create: [
              { name: "咨询", quantity: 10, unitPrice: 30 },
              { name: "运维", quantity: 2, unitPrice: 100 },
            ],
          },
        }),
      })
    );
  });

  it("管理员可读取全部报价，普通负责人只读取本人客户的报价", async () => {
    prismaMock.quotation.findMany.mockResolvedValue([]);

    await listQuotations(scope(admin));
    await listQuotations(scope(owner));

    expect(prismaMock.quotation.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: {} })
    );
    expect(prismaMock.quotation.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { customer: { ownerId: owner.id } },
      })
    );
  });

  it("列表按商机筛选时仍保留负责人范围", async () => {
    prismaMock.quotation.findMany.mockResolvedValue([]);

    await listQuotations(scope(owner), "opportunity_own");

    expect(prismaMock.quotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          opportunityId: "opportunity_own",
          customer: { ownerId: owner.id },
        },
      })
    );
  });

  it("详情越权与不存在统一返回 null，不泄露存在性", async () => {
    prismaMock.quotation.findFirst.mockResolvedValue(null);

    await expect(getQuotation("foreign", scope(owner))).resolves.toBeNull();
    await expect(getQuotation("missing", scope(admin))).resolves.toBeNull();
  });

  it("普通负责人不能基于他人客户创建报价", async () => {
    prismaMock.opportunity.findFirst.mockResolvedValue({
      customerId: "foreign_customer",
    });
    prismaMock.customer.findFirst.mockResolvedValue(null);

    await expect(
      createQuotation(
        {
          opportunityId: "foreign_opportunity",
          items: items([["咨询", 1, 100]]),
        },
        scope(owner)
      )
    ).rejects.toBeInstanceOf(QuotationNotFoundError);
    expect(prismaMock.quotation.create).not.toHaveBeenCalled();
  });

  it("普通负责人编辑他人报价统一得到 NOT_FOUND", async () => {
    prismaMock.quotation.findFirst.mockResolvedValue(null);

    await expect(
      updateQuotation(
        "foreign",
        { items: items([["咨询", 1, 100]]) },
        scope(owner)
      )
    ).rejects.toThrow("NOT_FOUND");
    expect(prismaMock.quotation.update).not.toHaveBeenCalled();
  });

  it("管理员可创建并编辑任意客户的报价", async () => {
    prismaMock.opportunity.findFirst.mockResolvedValue({
      customerId: "customer_foreign",
    });
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "customer_foreign",
    });
    prismaMock.quotation.create.mockImplementation(async ({ data }) => ({
      id: "quotation_admin",
      ...data,
    }));
    prismaMock.quotation.findFirst.mockResolvedValue({
      id: "quotation_admin",
    });
    prismaMock.quotation.update.mockImplementation(async ({ data }) => ({
      id: "quotation_admin",
      ...data,
    }));

    await createQuotation(
      {
        opportunityId: "opportunity_foreign",
        items: items([["咨询", 2, 60]]),
      },
      scope(admin)
    );
    await updateQuotation(
      "quotation_admin",
      { status: "CANCELLED", items: items([["咨询", 1, 60]]) },
      scope(admin)
    );

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "customer_foreign" },
      })
    );
    expect(prismaMock.quotation.create).toHaveBeenCalled();
    expect(prismaMock.quotation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "quotation_admin" } })
    );
  });
});
