import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAllCustomerNames: vi.fn(),
  createCustomer: vi.fn(),
  accessScopeFor: vi.fn(),
}));

vi.mock("@/lib/auth/scope", () => ({
  accessScopeFor: mocks.accessScopeFor,
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  listAllCustomerNames: mocks.listAllCustomerNames,
  createCustomer: mocks.createCustomer,
}));

import { importCustomers } from "./customers";
import type { CurrentUser } from "@/lib/auth/session";

const user: CurrentUser = { id: "owner_1", name: "张三", role: "OWNER" };
const scope = { userId: "owner_1", role: "OWNER" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accessScopeFor.mockReturnValue(scope);
  mocks.listAllCustomerNames.mockResolvedValue([]);
  mocks.createCustomer.mockImplementation(async (data: { name: string }) => ({
    id: `new_${data.name}`,
    ...data,
  }));
});

describe("客户批量导入", () => {
  it("按名称归一化跳过库内已存在的客户，不覆盖", async () => {
    mocks.listAllCustomerNames.mockResolvedValue([
      { name: "杭州云启科技有限公司" },
    ]);

    const result = await importCustomers(
      [{ 客户名称: " 杭州云启科技 ", 电话: "138" }],
      user
    );

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(result.rows[0].reason).toContain("已存在同名客户");
  });

  it("普通负责人跳过他人名下同名客户（全局查重，不依赖 scope 可见性）", async () => {
    // 该客户属于他人，普通负责人通过 scope 列表看不到，但全局查重集合里存在。
    mocks.listAllCustomerNames.mockResolvedValue([
      { name: "竞品科技有限公司" },
    ]);

    const result = await importCustomers([{ 客户名称: "竞品科技" }], user);

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(mocks.listAllCustomerNames).toHaveBeenCalledTimes(1);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(result.rows[0].reason).toContain("已存在同名客户");
  });

  it("同一批次内重复名称只导入第一条", async () => {
    const result = await importCustomers(
      [
        { 客户名称: "云启科技" },
        { 客户名称: "云启科技有限公司" },
        { 客户名称: "Acme" },
      ],
      user
    );

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.rows.map((r) => r.status)).toEqual([
      "created",
      "skipped",
      "created",
    ]);
  });

  it("空名称的行标记为失败，不写入", async () => {
    const result = await importCustomers([{ 客户名称: "  " }], user);

    expect(result.failed).toBe(1);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(result.rows[0].reason).toBe("客户名称为空");
  });

  it("写入复用 createCustomer 并传入 scope，与手动新建同源", async () => {
    await importCustomers(
      [{ 客户名称: "新客户", 等级: "高", 行业: "教育" }],
      user
    );

    expect(mocks.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "新客户",
        level: "HIGH",
        industry: "教育",
      }),
      scope
    );
  });

  it("单行写入抛错时记录失败并继续后续行", async () => {
    mocks.createCustomer
      .mockResolvedValueOnce({ id: "ok" })
      .mockRejectedValueOnce(new Error("写入失败"))
      .mockResolvedValueOnce({ id: "ok2" });

    const result = await importCustomers(
      [{ 客户名称: "A" }, { 客户名称: "B" }, { 客户名称: "C" }],
      user
    );

    expect(result.created).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.rows[1].reason).toBe("写入失败");
  });
});
