import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #35 报价转合同服务外部行为测试。
 *
 * 只经过合同服务这一公开接缝：转换产生的客户/商机/来源报价关联、
 * 单次事务与状态确认、负责人范围、越权统一 NOT_FOUND，以及
 * 合同列表与详情的来源可追溯读取。
 */

const txMock = vi.hoisted(() => ({
  quotation: { findFirst: vi.fn(), updateMany: vi.fn() },
  contract: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  ...txMock,
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  ContractNotFoundError,
  convertQuotationToContract,
  getContract,
  listContracts,
} from "./contract";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const otherOwner = { id: "owner_2", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const scope = (user: typeof owner | typeof otherOwner | typeof admin) => ({
  userId: user.id,
  role: user.role,
});

const quotation = {
  id: "quotation_1",
  customerId: "customer_own",
  opportunityId: "opportunity_own",
  status: "CONFIRMED",
  amount: 600,
  customer: { id: "customer_own", name: "客户甲", ownerId: owner.id },
  opportunity: { id: "opportunity_own", name: "商机甲" },
};

const contract = {
  id: "contract_1",
  status: "DRAFT",
  amount: quotation.amount,
  customerId: quotation.customerId,
  opportunityId: quotation.opportunityId,
  sourceQuotationId: quotation.id,
  sourceQuotation: quotation,
  customer: quotation.customer,
  opportunity: quotation.opportunity,
};

/** 默认让事务回调拿到 mock tx 并返回其真实结果。 */
function happyPath() {
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)
  );
  txMock.quotation.findFirst.mockResolvedValue(quotation);
  txMock.quotation.updateMany.mockResolvedValue({ count: 1 });
  txMock.contract.create.mockResolvedValue(contract);
  txMock.contract.findMany.mockResolvedValue([]);
  txMock.contract.findFirst.mockResolvedValue(null);
  txMock.contract.findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  vi.resetAllMocks();
  happyPath();
});

describe("报价转合同服务（prisma.$transaction 接缝）", () => {
  it("把已确认报价转为合同：一次事务内保留客户、商机与来源报价关联，并确认草稿报价", async () => {
    txMock.quotation.findFirst.mockResolvedValue({
      ...quotation,
      status: "DRAFT",
    });

    const result = await convertQuotationToContract(
      quotation.id,
      scope(owner)
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.quotation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: quotation.id,
          customer: { ownerId: owner.id },
        }),
      })
    );
    expect(txMock.contract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          amount: quotation.amount,
          customer: { connect: { id: quotation.customerId } },
          opportunity: { connect: { id: quotation.opportunityId } },
          sourceQuotation: { connect: { id: quotation.id } },
        }),
        include: expect.objectContaining({ sourceQuotation: true }),
      })
    );
    expect(txMock.quotation.updateMany).toHaveBeenCalledWith({
      where: {
        id: quotation.id,
        status: { not: "CONFIRMED" },
        customer: { ownerId: owner.id },
      },
      data: { status: "CONFIRMED" },
    });
    expect(result).toEqual(expect.objectContaining({ id: contract.id }));
  });

  it("报价已是已确认且尚未转过合同时仍可转合同，事务内不再修改报价状态", async () => {
    await convertQuotationToContract(quotation.id, scope(owner));

    expect(txMock.quotation.updateMany).not.toHaveBeenCalled();
    expect(txMock.contract.create).toHaveBeenCalledTimes(1);
  });

  it("同一报价重复转换统一拒绝，不再创建第二份合同", async () => {
    txMock.contract.findUnique.mockResolvedValue({ id: contract.id });

    await expect(
      convertQuotationToContract(quotation.id, scope(owner))
    ).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(
      convertQuotationToContract(quotation.id, scope(admin))
    ).rejects.toThrow("NOT_FOUND");

    expect(txMock.contract.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceQuotationId: quotation.id },
      })
    );
    expect(txMock.contract.create).not.toHaveBeenCalled();
    expect(txMock.quotation.updateMany).not.toHaveBeenCalled();
  });

  it("跨负责人或报价不存在统一拒绝，且不执行任何写入", async () => {
    txMock.quotation.findFirst.mockResolvedValue(null);

    await expect(
      convertQuotationToContract("foreign", scope(otherOwner))
    ).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(
      convertQuotationToContract("missing", scope(admin))
    ).rejects.toThrow("NOT_FOUND");

    expect(txMock.contract.create).not.toHaveBeenCalled();
    expect(txMock.quotation.updateMany).not.toHaveBeenCalled();
  });

  it("管理员可转换任意客户的报价，写入守卫不再按负责人收窄", async () => {
    await convertQuotationToContract(quotation.id, scope(admin));

    expect(txMock.quotation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: quotation.id }),
      })
    );
    expect(txMock.quotation.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      "customer"
    );
    expect(txMock.contract.create).toHaveBeenCalledTimes(1);
  });

  it("列表按权限收窄，并始终带出来源报价与客户、商机", async () => {
    await listContracts(scope(admin));
    await listContracts(scope(owner));

    expect(txMock.contract.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {},
        include: expect.objectContaining({
          sourceQuotation: true,
          customer: true,
          opportunity: true,
        }),
      })
    );
    expect(txMock.contract.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { customer: { ownerId: owner.id } },
      })
    );
  });

  it("详情越权与不存在统一返回 null，存在时来源报价可追溯", async () => {
    await expect(
      getContract("foreign", scope(otherOwner))
    ).resolves.toBeNull();

    txMock.contract.findFirst.mockResolvedValue(contract);
    await expect(getContract(contract.id, scope(owner))).resolves.toEqual(
      expect.objectContaining({
        sourceQuotationId: quotation.id,
        sourceQuotation: expect.objectContaining({ id: quotation.id }),
      })
    );
    expect(txMock.contract.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: contract.id,
          customer: { ownerId: owner.id },
        }),
        include: expect.objectContaining({ sourceQuotation: true }),
      })
    );
  });
});
