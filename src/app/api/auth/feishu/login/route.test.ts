import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFeishuConfigured: vi.fn(),
  randomBytes: vi.fn(),
  issueOAuthState: vi.fn(),
}));

vi.mock("@/lib/feishu/client", () => ({
  isFeishuConfigured: mocks.isFeishuConfigured,
}));

// OAuth state 一次性校验走共享存储（#46）。
vi.mock("@/lib/auth/oauth-state", () => ({
  OAUTH_STATE_TTL_MS: 10 * 60 * 1000,
  issueOAuthState: mocks.issueOAuthState,
  consumeOAuthState: vi.fn(),
}));

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomBytes: mocks.randomBytes,
  };
});

import { GET } from "./route";

function loginRequest(search = "") {
  return new NextRequest(`https://crm.example.com/api/auth/feishu/login${search}`);
}

function cookiesOf(response: Response): string[] {
  return response.headers.getSetCookie();
}

function cookieValue(response: Response, name: string): string | undefined {
  const cookie = cookiesOf(response).find((entry) => entry.startsWith(`${name}=`));
  return cookie?.split(";")[0]?.slice(name.length + 1);
}

describe("Feishu OAuth login route", () => {
  beforeEach(() => {
    mocks.isFeishuConfigured.mockReset();
    mocks.randomBytes.mockReset();
    mocks.issueOAuthState.mockReset();
    mocks.issueOAuthState.mockResolvedValue(undefined);
    vi.stubEnv("FEISHU_APP_ID", "cli_test");
    vi.stubEnv("FEISHU_APP_SECRET", "secret");
    vi.stubEnv("FEISHU_OAUTH_REDIRECT_URI", "https://crm.example.com/api/auth/feishu/callback");
    vi.stubEnv("FEISHU_OAUTH_SCOPE", "contact:user.id:readonly");
    vi.stubEnv("FEISHU_APP_DOMAIN", "https://open.feishu.cn");
  });

  it("returns an actionable error when Feishu credentials are missing", async () => {
    mocks.isFeishuConfigured.mockReturnValue(false);

    const response = await GET(loginRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "config_missing" })
    );
    expect(response.headers.get("location")).toBeNull();
    expect(cookiesOf(response)).toEqual([]);
  });

  it("redirects to the configured Feishu authorize page with a short-lived state cookie", async () => {
    mocks.isFeishuConfigured.mockReturnValue(true);
    mocks.randomBytes.mockReturnValue(Buffer.from("a".repeat(32), "utf8"));

    const response = await GET(loginRequest("?next=%2Fcustomers"));

    expect(response.status).toBe(307);
    const authorizeUrl = new URL(response.headers.get("location")!);
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
      "https://open.feishu.cn/open-apis/authen/v1/index"
    );
    expect(authorizeUrl.searchParams.get("app_id")).toBe("cli_test");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "https://crm.example.com/api/auth/feishu/callback"
    );
    expect(authorizeUrl.searchParams.get("scope")).toBe("contact:user.id:readonly");
    expect(authorizeUrl.searchParams.get("state")).toBe(
      cookieValue(response, "fscrm_oauth_state")
    );

    const stateCookie = cookiesOf(response).find((entry) =>
      entry.startsWith("fscrm_oauth_state=")
    );
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("SameSite=lax");
    expect(stateCookie).toContain("Path=/api/auth/feishu/callback");
    expect(stateCookie).toContain("Max-Age=600");
    expect(stateCookie).not.toContain("Secure");
    expect(decodeURIComponent(cookieValue(response, "fscrm_oauth_next") ?? "")).toBe(
      "/customers"
    );
  });

  it.each([
    ["a fully qualified URL", "https%3A%2F%2Fevil.example"],
    ["a protocol-relative URL", "%2F%2Fevil.example"],
    ["a backslash-normalized URL", "%2F%5Cevil.example"],
  ])("rejects %s as a next destination", async (_label, encodedNext) => {
    mocks.isFeishuConfigured.mockReturnValue(true);
    mocks.randomBytes.mockReturnValue(Buffer.from("a".repeat(32), "utf8"));

    const response = await GET(loginRequest(`?next=${encodedNext}`));

    expect(response.status).toBe(307);
    expect(decodeURIComponent(cookieValue(response, "fscrm_oauth_next") ?? "")).toBe("/");
  });

  it("returns an actionable error when OAuth redirect URI is missing", async () => {
    mocks.isFeishuConfigured.mockReturnValue(true);
    vi.stubEnv("FEISHU_OAUTH_REDIRECT_URI", "");

    const response = await GET(loginRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "config_missing" })
    );
    expect(response.headers.get("location")).toBeNull();
  });
});
