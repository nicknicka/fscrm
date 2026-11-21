import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  convertQuotationToContract: vi.fn(),
  listContracts: vi.fn(),
  getContract: vi.fn(),
  ContractNotFoundError: class ContractNotFoundError extends Error {},
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/db/repositories/contract", () => ({
  ContractNotFoundError: mocks.ContractNotFoundError,
  convertQuotationToContract: mocks.convertQuotationToContract,
  listContracts: mocks.listContracts,
  getContract: mocks.getContract,
}));

import {
  convertQuotationToContractAction,
  getContractForCurrentUser,
  listContractsForCurrentUser,
} from "./actions";

const owner = { id: "owner_1", name: "张三", role: "OWNER" as const };
const otherOwner = { id: "owner_2", name: "李四", role: "OWNER" as const };
const admin = { id: "admin_1", name: "管理员", role: "ADMIN" as const };

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(owner);
  mocks.convertQuotationToContract.mockResolvedValue({
    id: "contract_1",
    sourceQuotationId: "quotation_1",
  });
  mocks.listContracts.mockResolvedValue([]);
  mocks.getContract.mockResolvedValue({ id: "contract_1" });
});

describe("合同 Server Actions", () => {
  it("负责人把报价转为合同时传当前权限范围，成功后刷新来源商机与合同页", async () => {
    const result = await convertQuotationToContractAction(
      "quotation_1",
      "opportunity_own"
    );

    expect(result).toEqual({
      ok: true,
      contractId: "contract_1",
    });
    expect(mocks.convertQuotationToContract).toHaveBeenCalledWith(
      "quotation_1",
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/opportunities/opportunity_own"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/contracts/contract_1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/contracts");
  });

  it("越权转换统一返回 NOT_FOUND，失败不刷新任何页面", async () => {
    mocks.requireCurrentUser.mockResolvedValue(otherOwner);
    mocks.convertQuotationToContract.mockRejectedValue(
      new mocks.ContractNotFoundError()
    );

    await expect(
      convertQuotationToContractAction("foreign_quotation", "foreign_opportunity")
    ).resolves.toEqual(NOT_FOUND);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("列表与详情读取从会话构造权限范围，管理员可见全部", async () => {
    await listContractsForCurrentUser();
    await getContractForCurrentUser("contract_1");
    mocks.requireCurrentUser.mockResolvedValue(admin);
    await listContractsForCurrentUser();

    expect(mocks.listContracts).toHaveBeenNthCalledWith(1, {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.getContract).toHaveBeenCalledWith("contract_1", {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.listContracts).toHaveBeenNthCalledWith(2, {
      userId: admin.id,
      role: admin.role,
    });
  });

  it("所有入口先校验会话，未登录不读写", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      convertQuotationToContractAction("quotation_1", "opportunity_own")
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(listContractsForCurrentUser()).rejects.toThrow(
      "UNAUTHENTICATED"
    );
    await expect(getContractForCurrentUser("contract_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );

    expect(mocks.convertQuotationToContract).not.toHaveBeenCalled();
    expect(mocks.listContracts).not.toHaveBeenCalled();
    expect(mocks.getContract).not.toHaveBeenCalled();
  });
});
