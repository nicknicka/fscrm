import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl } from "./oauth";

describe("buildAuthorizeUrl", () => {
  it("包含应用 ID、回调地址等必要参数", () => {
    const url = buildAuthorizeUrl({
      appId: "cli_test",
      redirectUri: "https://example.com/callback",
    });
    expect(url).toContain("app_id=cli_test");
    expect(url).toContain("redirect_uri=https");
    expect(url).toContain("open-apis/authen/v1/index");
  });

  it("包含 scope 与 state", () => {
    const url = buildAuthorizeUrl({
      appId: "cli_test",
      redirectUri: "https://example.com/callback",
      scope: "contact:user.read",
      state: "abc123",
    });
    expect(url).toContain("scope=contact");
    expect(url).toContain("state=abc123");
  });

  it("未传 scope/state 时不包含对应参数", () => {
    const url = buildAuthorizeUrl({
      appId: "cli_test",
      redirectUri: "https://example.com/callback",
    });
    expect(url).not.toContain("scope=");
    expect(url).not.toContain("state=");
  });

  it("Lark 域名时使用对应开放平台域名", () => {
    const url = buildAuthorizeUrl({
      appId: "cli_test",
      redirectUri: "https://example.com/callback",
      domain: "https://open.larksuite.com",
    });
    expect(url).toContain("https://open.larksuite.com");
  });
});
