import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  listLeads: vi.fn(),
  listOpportunities: vi.fn(),
  listFollowUps: vi.fn(),
  listContracts: vi.fn(),
  listOrders: vi.fn(),
  accessScopeFor: vi.fn(),
}));

vi.mock("@/lib/auth/scope", () => ({
  accessScopeFor: mocks.accessScopeFor,
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  listCustomers: mocks.listCustomers,
}));

vi.mock("@/lib/db/repositories/contract", () => ({
  listContracts: mocks.listContracts,
}));

vi.mock("@/lib/db/repositories/order", () => ({
  listOrders: mocks.listOrders,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  listLeads: mocks.listLeads,
  listOpportunities: mocks.listOpportunities,
  listFollowUps: mocks.listFollowUps,
}));

import { loadExportDataset } from "./datasets";

const user = { id: "admin_1", name: "管理员", role: "ADMIN" } as const;
const scope = { userId: "admin_1", role: "ADMIN" } as const;

function stubRows() {
  mocks.listCustomers.mockResolvedValue([]);
  mocks.listLeads.mockResolvedValue([]);
  mocks.listOpportunities.mockResolvedValue([]);
  mocks.listFollowUps.mockResolvedValue([]);
  mocks.listContracts.mockResolvedValue([]);
  mocks.listOrders.mockResolvedValue([]);
}

describe("loadExportDataset 筛选条件透传", () => {
  it("customers 把 search/ownerId 传给 listCustomers", async () => {
    stubRows();
    mocks.accessScopeFor.mockReturnValue(scope);
    await loadExportDataset(user, "customers", {
      search: "云启",
      ownerId: "user_2",
    });
    expect(mocks.listCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ search: "云启", ownerId: "user_2" }),
      scope
    );
  });

  it("leads 把 search 传给 listLeads", async () => {
    stubRows();
    mocks.accessScopeFor.mockReturnValue(scope);
    await loadExportDataset(user, "leads", { search: "云启" });
    expect(mocks.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({ search: "云启" }),
      scope
    );
  });

  it("opportunities 把 search/stage/ownerId 传给 listOpportunities", async () => {
    stubRows();
    await loadExportDataset(user, "opportunities", {
      search: "采购",
      stage: "QUOTE",
      ownerId: "user_2",
    });
    expect(mocks.listOpportunities).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "采购",
        stage: "QUOTE",
        ownerId: "user_2",
      }),
      user
    );
  });

  it("无筛选条件时保持原有调用方式", async () => {
    stubRows();
    mocks.accessScopeFor.mockReturnValue(scope);
    await loadExportDataset(user, "customers");
    await loadExportDataset(user, "leads");
    await loadExportDataset(user, "opportunities");
    expect(mocks.listCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined, ownerId: undefined }),
      scope
    );
    expect(mocks.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
      scope
    );
    expect(mocks.listOpportunities).toHaveBeenCalledWith(
      expect.objectContaining({
        search: undefined,
        stage: undefined,
        ownerId: undefined,
      }),
      user
    );
  });

  it("contracts/orders/followups 不受筛选影响", async () => {
    stubRows();
    mocks.accessScopeFor.mockReturnValue(scope);
    await loadExportDataset(user, "contracts", { search: "x" });
    await loadExportDataset(user, "orders", { search: "x" });
    await loadExportDataset(user, "followups", { search: "x" });
    expect(mocks.listContracts).toHaveBeenCalledWith(scope);
    expect(mocks.listOrders).toHaveBeenCalledWith(scope);
    expect(mocks.listFollowUps).toHaveBeenCalledWith({}, user);
  });
});
