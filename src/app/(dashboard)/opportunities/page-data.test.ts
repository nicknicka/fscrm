import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOpportunitiesForCurrentUser: vi.fn(),
  loadOpportunityFormCustomers: vi.fn(),
  loadOpportunityFormUsers: vi.fn(),
}));

vi.mock("./scope", () => ({
  listOpportunitiesForCurrentUser: mocks.listOpportunitiesForCurrentUser,
}));

vi.mock("./form-options", () => ({
  loadOpportunityFormCustomers: mocks.loadOpportunityFormCustomers,
  loadOpportunityFormUsers: mocks.loadOpportunityFormUsers,
}));

import { loadOpportunitiesPageData } from "./page-data";
import type { CurrentUser } from "@/lib/auth/session";

const user: CurrentUser = { id: "owner_1", name: "张三", role: "OWNER" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listOpportunitiesForCurrentUser.mockResolvedValue([]);
  mocks.loadOpportunityFormCustomers.mockResolvedValue([]);
  mocks.loadOpportunityFormUsers.mockResolvedValue([]);
});

describe("商机列表阶段筛选", () => {
  it("传入阶段时只请求该阶段的商机，并保持当前会话范围", async () => {
    await loadOpportunitiesPageData(user, "QUOTE");

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(user, {
      stage: "QUOTE",
    });
  });

  it("未选择阶段时不过滤商机", async () => {
    await loadOpportunitiesPageData(user, null);

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      {}
    );
  });

  it("非法阶段值被忽略，不传给仓储查询", async () => {
    await loadOpportunitiesPageData(user, "NOT_A_STAGE" as never);

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      {}
    );
  });
});
