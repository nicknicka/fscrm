import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isFeishuConfigured: vi.fn(),
  authenticateWithCode: vi.fn(),
  createDbPersonLookup: vi.fn(),
}));

vi.mock("@/lib/feishu/client", () => ({
  isFeishuConfigured: mocks.isFeishuConfigured,
}));

vi.mock("@/lib/feishu/identity/service", () => ({
  authenticateWithCode: mocks.authenticateWithCode,
}));

vi.mock("@/lib/db/feishu-binding", () => ({
  createDbPersonLookup: mocks.createDbPersonLookup,
}));

const lookup = { findByOpenId: vi.fn() };

const OAUTH_STATE_COOKIE_NAME = "fscrm_oauth_state";

import { GET as getLogin } from "../login/route";
import { GET } from "./route";

function callbackRequest(options: {
  params?: Record<string, string>;
  state?: string | null;
  next?: string | null;
} = {}) {
  const url = new URL("https://crm.example.com/api/auth/feishu/callback");
  const params = options.params ?? { code: "code-123", state: "state-456" };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const request = new NextRequest(url);
  const state =
    "state" in options ? options.state : (params.state ?? "state-456");
  if (state) {
    request.cookies.set(OAUTH_STATE_COOKIE_NAME, state);
  }
  if ("next" in options) {
    request.cookies.set("fscrm_oauth_next", options.next ?? "/");
  }
  return request;
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function allSetCookies(response: Response): string {
  return setCookies(response).join("\n");
}

function setCookieNamed(response: Response, name: string): string | undefined {
  return setCookies(response).find((entry) => entry.startsWith(`${name}=`));
}

const BASE_URL = "https://crm.example.com";
const LOGIN_URL = `${BASE_URL}/api/auth/feishu/login`;

function decodeCookieValue(entry: string | undefined): string | undefined {
  if (!entry) return undefined;
  const match = entry.match(/^([^=]+)=(.*?)(?:;|$)/);
  return match ? decodeURIComponent(match[2]) : undefined;
}

async function issueState(): Promise<string> {
  const response = await getLogin(new NextRequest(LOGIN_URL));
  expect(response.status).toBe(307);
  const stateCookieEntry = setCookieNamed(response, OAUTH_STATE_COOKIE_NAME);
  const state = decodeCookieValue(stateCookieEntry);
  expect(state).toBeTruthy();
  return state!;
}

function matchedResult() {
  return {
    auth: {
      token: { accessToken: "u-access", refreshToken: "u-refresh" },
      user: { openId: "ou_1", name: "张三" },
    },
    match: {
      status: "matched",
      person: { id: "user_1", name: "张三", role: "OWNER" },
      profile: { openId: "ou_1", name: "张三" },
    },
  };
}

describe("Feishu OAuth callback route", () => {
  beforeAll(() => {
    vi.stubEnv("FEISHU_APP_ID", "cli_test");
    vi.stubEnv("FEISHU_APP_SECRET", "secret");
    vi.stubEnv("FEISHU_OAUTH_REDIRECT_URI", `${BASE_URL}/api/auth/feishu/callback`);
    vi.stubEnv("FEISHU_OAUTH_SCOPE", "contact:user.id:readonly");
    vi.stubEnv("FEISHU_APP_DOMAIN", "https://open.feishu.cn");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "test-session-secret-that-is-at-least-thirty-two-bytes");
    mocks.isFeishuConfigured.mockReturnValue(true);
    mocks.createDbPersonLookup.mockReturnValue(lookup);
  });

  it("rejects a callback whose state does not match the one-time cookie", async () => {
    const state = await issueState();
    const response = await GET(callbackRequest({ state: "different-state" }));
    expect(state).not.toBe("different-state");

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "invalid_state"
    );
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
    expect(mocks.authenticateWithCode).not.toHaveBeenCalled();
    expect(allSetCookies(response)).toContain("fscrm_oauth_state=")
    expect(allSetCookies(response)).toContain("Max-Age=0");
  });

  it("rejects a callback with no state cookie", async () => {
    await issueState();
    const response = await GET(callbackRequest({ state: null }));

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "invalid_state"
    );
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
    expect(mocks.authenticateWithCode).not.toHaveBeenCalled();
  });


  it("rejects a replayed authorization code/state pair without issuing a second session", async () => {
    mocks.authenticateWithCode.mockResolvedValue(matchedResult());
    const state = await issueState();
    const initial = callbackRequest({ params: { code: "code-123", state } });
    const response = await GET(initial);

    expect(setCookieNamed(response, "fscrm_session")).toBeDefined();
    expect(setCookieNamed(response, OAUTH_STATE_COOKIE_NAME)).toContain("Max-Age=0");

    const replayResponse = await GET(
      callbackRequest({ params: { code: "code-123", state } })
    );
    expect(setCookieNamed(replayResponse, "fscrm_session")).toBeUndefined();
    expect(
      new URL(replayResponse.headers.get("location")!).searchParams.get("error")
    ).toBe("invalid_state");
    expect(mocks.authenticateWithCode).toHaveBeenCalledTimes(1);
  });

  it("maps Feishu denial to a login error without creating a session", async () => {
    await issueState();
    const response = await GET(
      callbackRequest({
        params: { error: "access_denied", error_description: "user cancelled" },
      })
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("cancelled");
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
    expect(mocks.authenticateWithCode).not.toHaveBeenCalled();
    expect(allSetCookies(response)).toContain("fscrm_oauth_state=")
    expect(allSetCookies(response)).toContain("Max-Age=0");
  });

  it("maps cancelled authorization to a login error", async () => {
    await issueState();
    const response = await GET(
      callbackRequest({ params: { error: "user_denied", state: "state-456" } })
    );

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "cancelled"
    );
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
    expect(mocks.authenticateWithCode).not.toHaveBeenCalled();
  });

  it("reports missing Feishu credentials before exchanging a code", async () => {
    const state = await issueState();
    mocks.isFeishuConfigured.mockReturnValue(false);

    const response = await GET(callbackRequest({ params: { code: "code-123", state } }));

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "config_missing"
    );
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
    expect(mocks.authenticateWithCode).not.toHaveBeenCalled();
  });

  it("returns 400 when the authorization code is missing", async () => {
    mocks.isFeishuConfigured.mockReturnValue(true);
    const state = await issueState();
    const response = await GET(callbackRequest({ params: { state } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "missing_code" })
    );
    expect(mocks.authenticateWithCode).not.toHaveBeenCalled();
  });

  it("does not create a session for an unbound Feishu user", async () => {
    mocks.authenticateWithCode.mockResolvedValue({
      ...matchedResult(),
      match: { status: "unmatched", person: null, profile: { openId: "ou_unknown" } },
    });
    const state = await issueState();

    const response = await GET(callbackRequest({ params: { code: "code-123", state } }));

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "unbound"
    );
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
    expect(allSetCookies(response)).toContain("fscrm_oauth_state=")
    expect(allSetCookies(response)).toContain("Max-Age=0");
  });

  it("maps code exchange failures to auth_failed without a session", async () => {
    mocks.authenticateWithCode.mockRejectedValue(new Error("code expired"));
    const state = await issueState();

    const response = await GET(callbackRequest({ params: { code: "code-123", state } }));

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "auth_failed"
    );
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
    expect(allSetCookies(response)).toContain("fscrm_oauth_state=")
    expect(allSetCookies(response)).toContain("Max-Age=0");
  });

  it("maps missing session secret to config_missing without a session", async () => {
    mocks.authenticateWithCode.mockResolvedValue(matchedResult());
    vi.stubEnv("SESSION_SECRET", "too-short");
    const state = await issueState();

    const response = await GET(callbackRequest({ params: { code: "code-123", state } }));

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "config_missing"
    );
    expect(setCookieNamed(response, "fscrm_session")).toBeUndefined();
  });

  it("sets an HttpOnly SameSite=Lax session cookie and redirects safely on success", async () => {
    mocks.authenticateWithCode.mockResolvedValue(matchedResult());
    const state = await issueState();

    const response = await GET(
      callbackRequest({ params: { code: "code-123", state }, next: "/customers?q=1" })
    );

    expect(mocks.authenticateWithCode).toHaveBeenCalledWith(
      "code-123",
      lookup
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://crm.example.com/customers?q=1"
    );
    const sessionCookie = setCookieNamed(response, "fscrm_session");
    const sessionToken = decodeURIComponent(
      (sessionCookie ?? "").split("=")[1] ?? ""
    );
    expect(sessionCookie).toContain("fscrm_session=");
    expect(sessionToken.length).toBeGreaterThan(10);
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=lax");
    expect(sessionCookie).toContain("Path=/");
    expect(sessionCookie).toContain("Max-Age=604800");
    expect(sessionCookie).not.toContain("Secure");
    expect(allSetCookies(response)).toContain("fscrm_oauth_state=")
    expect(allSetCookies(response)).toContain("Max-Age=0");
    expect(JSON.stringify(setCookies(response))).not.toContain("u-access");
    expect(JSON.stringify(setCookies(response))).not.toContain("u-refresh");
  });

  it.each([
    ["a fully qualified URL", "https://evil.example"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash-normalized URL", "/\\evil.example"],
  ])("rejects a next cookie containing %s", async (_label, next) => {
    mocks.authenticateWithCode.mockResolvedValue(matchedResult());
    const state = await issueState();

    const response = await GET(
      callbackRequest({ params: { code: "code-123", state }, next })
    );

    expect(response.headers.get("location")).toBe("https://crm.example.com/");
    expect(setCookieNamed(response, "fscrm_session")).toBeDefined();
  });

  it("marks the session cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.authenticateWithCode.mockResolvedValue(matchedResult());
    const state = await issueState();

    const response = await GET(callbackRequest({ params: { code: "code-123", state } }));

    expect(setCookieNamed(response, "fscrm_session")).toContain("Secure");
  });
});
