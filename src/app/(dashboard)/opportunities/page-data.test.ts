import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOpportunitiesForCurrentUser: vi.fn(),
  countOpportunitiesForCurrentUser: vi.fn(),
  loadOpportunityFormCustomers: vi.fn(),
  loadOpportunityFormUsers: vi.fn(),
}));

vi.mock("./scope", () => ({
  listOpportunitiesForCurrentUser: mocks.listOpportunitiesForCurrentUser,
  countOpportunitiesForCurrentUser: mocks.countOpportunitiesForCurrentUser,
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
  mocks.countOpportunitiesForCurrentUser.mockResolvedValue(0);
  mocks.loadOpportunityFormCustomers.mockResolvedValue([]);
  mocks.loadOpportunityFormUsers.mockResolvedValue([]);
});

describe("商机列表筛选与分页", () => {
  it("传入合法阶段时只请求该阶段的商机", async () => {
    await loadOpportunitiesPageData(user, { stage: "QUOTE" });

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      { stage: "QUOTE" },
      {}
    );
    expect(mocks.countOpportunitiesForCurrentUser).toHaveBeenCalledWith(user, {
      stage: "QUOTE",
    });
  });

  it("未选择阶段/搜索/负责人时不过滤", async () => {
    await loadOpportunitiesPageData(user, {});

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      {},
      {}
    );
  });

  it("非法阶段值被忽略", async () => {
    await loadOpportunitiesPageData(user, { stage: "NOT_A_STAGE" });

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      {},
      {}
    );
  });

  it("搜索词映射为 search 条件", async () => {
    await loadOpportunitiesPageData(user, { q: "云启" });

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      { search: "云启" },
      {}
    );
  });

  it("负责人、阶段、搜索可组合筛选", async () => {
    await loadOpportunitiesPageData(user, {
      q: "云启",
      stage: "QUOTE",
      ownerId: "user_2",
    });

    const filters = {
      stage: "QUOTE",
      ownerId: "user_2",
      search: "云启",
    };
    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      filters,
      {}
    );
    expect(mocks.countOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      filters
    );
  });

  it("分页参数透传给列表查询，且不影响计数", async () => {
    const pagination = { skip: 20, take: 10 };
    await loadOpportunitiesPageData(user, { stage: "QUOTE" }, pagination);

    expect(mocks.listOpportunitiesForCurrentUser).toHaveBeenCalledWith(
      user,
      { stage: "QUOTE" },
      pagination
    );
    expect(mocks.countOpportunitiesForCurrentUser).toHaveBeenCalledWith(user, {
      stage: "QUOTE",
    });
  });
});
