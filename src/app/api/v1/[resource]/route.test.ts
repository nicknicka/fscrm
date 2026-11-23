import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveApiKey: vi.fn(),
  findUniqueUser: vi.fn(),
  accessScopeFor: vi.fn(),
  listCustomers: vi.fn(),
  listLeads: vi.fn(),
  listOpportunities: vi.fn(),
  listContracts: vi.fn(),
  listOrders: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/api-key", () => ({
  resolveApiKey: mocks.resolveApiKey,
}));

vi.mock("@/lib/db/client", () => ({
  prisma: { user: { findUnique: mocks.findUniqueUser } },
}));

vi.mock("@/lib/auth/scope", () => ({
  accessScopeFor: mocks.accessScopeFor,
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  listCustomers: mocks.listCustomers,
}));

vi.mock("@/lib/db/repositories/sales", () => ({
  listLeads: mocks.listLeads,
  listOpportunities: mocks.listOpportunities,
}));

vi.mock("@/lib/db/repositories/contract", () => ({
  listContracts: mocks.listContracts,
}));

vi.mock("@/lib/db/repositories/order", () => ({
  listOrders: mocks.listOrders,
}));

import { GET } from "./route";

const API_KEY = "fscrm_testkey";
const SESSION_USER = { id: "user-session", name: "会话用户", role: "OWNER" };
const KEY_USER = { id: "user-key", name: "Key 用户", role: "ADMIN" };
const KEY_SCOPE = { userId: "user-key", role: "ADMIN" };

function request(
  resource: string,
  options: {
    query?: string;
    apiKey?: string | null;
  } = {}
) {
  const url = new URL(`https://crm.example.com/api/v1/${resource}`);
  if (options.query) url.search = options.query;
  const headers: Record<string, string> = {};
  if (options.apiKey !== null && options.apiKey !== undefined) {
    headers.authorization = `Bearer ${options.apiKey}`;
  }
  return new NextRequest(url, { headers });
}

function context(resource: string) {
  return { params: Promise.resolve({ resource }) };
}

/** 每个仓储替身返回带标记的行，便于断言调用参数。 */
function rows(tag: string, count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${tag}-${index}`,
  }));
}

describe("GET /api/v1/[resource]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.resolveApiKey.mockResolvedValue(null);
    mocks.findUniqueUser.mockResolvedValue(null);
    mocks.accessScopeFor.mockReturnValue(KEY_SCOPE);
    for (const repo of [
      mocks.listCustomers,
      mocks.listLeads,
      mocks.listOpportunities,
      mocks.listContracts,
      mocks.listOrders,
    ]) {
      repo.mockResolvedValue([]);
    }
  });

  describe("鉴权", () => {
    it("Bearer API Key 优先于 Cookie 会话，使用 key 关联用户的权限", async () => {
      mocks.getCurrentUser.mockResolvedValue(SESSION_USER);
      mocks.resolveApiKey.mockResolvedValue({ userId: KEY_USER.id });
      mocks.findUniqueUser.mockResolvedValue(KEY_USER);
      mocks.listCustomers.mockResolvedValue(rows("customer"));

      const response = await GET(
        request("customers", { apiKey: API_KEY }),
        context("customers")
      );

      expect(response.status).toBe(200);
      expect(mocks.resolveApiKey).toHaveBeenCalledWith(API_KEY);
      expect(mocks.findUniqueUser).toHaveBeenCalledWith({
        where: { id: KEY_USER.id },
      });
      // 有 Bearer 头时不得读取 Cookie，避免会话覆盖 key 的身份。
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
      expect(mocks.accessScopeFor).toHaveBeenCalledWith(KEY_USER);
      expect(mocks.accessScopeFor).toHaveBeenCalledTimes(1);
      expect(mocks.listCustomers).toHaveBeenCalledWith(
        { skip: 0, take: 50 },
        KEY_SCOPE
      );
      await expect(response.json()).resolves.toEqual({
        data: rows("customer"),
        pagination: { limit: 50, offset: 0, count: 1 },
      });
    });

    it("无效 Bearer Key 直接 401，不回落到会话", async () => {
      mocks.getCurrentUser.mockResolvedValue(SESSION_USER);
      mocks.resolveApiKey.mockResolvedValue(null);

      const response = await GET(
        request("customers", { apiKey: "bad-key" }),
        context("customers")
      );

      expect(response.status).toBe(401);
      expect(mocks.resolveApiKey).toHaveBeenCalledWith("bad-key");
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
      expect(mocks.listCustomers).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    });

    it("Key 关联用户不存在时返回 401", async () => {
      mocks.resolveApiKey.mockResolvedValue({ userId: "missing-user" });
      mocks.findUniqueUser.mockResolvedValue(null);

      const response = await GET(
        request("customers", { apiKey: API_KEY }),
        context("customers")
      );

      expect(response.status).toBe(401);
      expect(mocks.listCustomers).not.toHaveBeenCalled();
    });

    it("无 Bearer 时回落到 Cookie 会话", async () => {
      mocks.getCurrentUser.mockResolvedValue(SESSION_USER);
      mocks.accessScopeFor.mockReturnValue({
        userId: SESSION_USER.id,
        role: SESSION_USER.role,
      });

      const response = await GET(request("customers"), context("customers"));

      expect(response.status).toBe(200);
      expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(mocks.resolveApiKey).not.toHaveBeenCalled();
      expect(mocks.accessScopeFor).toHaveBeenCalledWith(SESSION_USER);
    });

    it("无鉴权信息时返回 401", async () => {
      const response = await GET(request("customers"), context("customers"));

      expect(response.status).toBe(401);
      expect(mocks.resolveApiKey).not.toHaveBeenCalled();
      expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(mocks.listCustomers).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    });
  });

  it("未知资源返回 404", async () => {
    mocks.getCurrentUser.mockResolvedValue(SESSION_USER);

    const response = await GET(request("secrets"), context("secrets"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "UNKNOWN_RESOURCE",
    });
    expect(mocks.listCustomers).not.toHaveBeenCalled();
    expect(mocks.listLeads).not.toHaveBeenCalled();
    expect(mocks.listOpportunities).not.toHaveBeenCalled();
    expect(mocks.listContracts).not.toHaveBeenCalled();
    expect(mocks.listOrders).not.toHaveBeenCalled();
  });

  describe("分页", () => {
    it("limit 默认 50，offset 默认 0，响应带 pagination meta", async () => {
      mocks.getCurrentUser.mockResolvedValue(SESSION_USER);
      mocks.listLeads.mockResolvedValue(rows("lead", 2));

      const response = await GET(request("leads"), context("leads"));

      expect(mocks.listLeads).toHaveBeenCalledWith(
        { skip: 0, take: 50 },
        expect.anything()
      );
      await expect(response.json()).resolves.toEqual({
        data: rows("lead", 2),
        pagination: { limit: 50, offset: 0, count: 2 },
      });
    });

    it("limit 与 offset 参数透传到仓储层并反映在 meta 中", async () => {
      mocks.getCurrentUser.mockResolvedValue(SESSION_USER);
      mocks.listContracts.mockResolvedValue(rows("contract", 3));

      const response = await GET(
        request("contracts", { query: "limit=10&offset=20" }),
        context("contracts")
      );

      expect(mocks.listContracts).toHaveBeenCalledWith(expect.anything(), {
        skip: 20,
        take: 10,
      });
      await expect(response.json()).resolves.toEqual({
        data: rows("contract", 3),
        pagination: { limit: 10, offset: 20, count: 3 },
      });
    });

    it("limit 超过 100 时夹到 100，负数和非整数回落到默认", async () => {
      mocks.getCurrentUser.mockResolvedValue(SESSION_USER);

      const cases = [
        { query: "limit=1000", limit: 100 },
        { query: "limit=-5", limit: 50 },
        { query: "limit=abc", limit: 50 },
        { query: "offset=-1", limit: 50 },
      ];
      for (const { query, limit } of cases) {
        await GET(request("orders", { query }), context("orders"));
        expect(mocks.listOrders).toHaveBeenLastCalledWith(expect.anything(), {
          skip: 0,
          take: limit,
        });
      }
    });
  });

  describe("权限 scope 传递", () => {
    it.each([
      [
        "customers",
        "listCustomers",
        (args: unknown[]) => ({ params: args[0], scope: args[1] }),
      ],
      [
        "leads",
        "listLeads",
        (args: unknown[]) => ({ params: args[0], scope: args[1] }),
      ],
      [
        "contracts",
        "listContracts",
        (args: unknown[]) => ({ params: args[1], scope: args[0] }),
      ],
      [
        "orders",
        "listOrders",
        (args: unknown[]) => ({ params: args[1], scope: args[0] }),
      ],
    ] as const)(
      "%s 把 accessScopeFor 的结果传给仓储层",
      async (resource, repo, pick) => {
        mocks.getCurrentUser.mockResolvedValue(SESSION_USER);
        const scope = { userId: SESSION_USER.id, role: SESSION_USER.role };
        mocks.accessScopeFor.mockReturnValue(scope);

        await GET(request(resource), context(resource));

        const args = mocks[repo].mock.calls[0] as unknown[];
        expect(pick(args).scope).toEqual(scope);
        expect(pick(args).params).toEqual({ skip: 0, take: 50 });
        expect(mocks.accessScopeFor).toHaveBeenCalledWith(SESSION_USER);
      }
    );

    it("opportunities 使用 accessScopeFor 派生 scope，当前用户直接传给仓储层", async () => {
      mocks.getCurrentUser.mockResolvedValue(SESSION_USER);
      const scope = { userId: SESSION_USER.id, role: SESSION_USER.role };
      mocks.accessScopeFor.mockReturnValue(scope);

      await GET(request("opportunities"), context("opportunities"));

      expect(mocks.accessScopeFor).toHaveBeenCalledWith(SESSION_USER);
      expect(mocks.listOpportunities).toHaveBeenCalledWith(
        { skip: 0, take: 50 },
        SESSION_USER
      );
    });
  });
});
