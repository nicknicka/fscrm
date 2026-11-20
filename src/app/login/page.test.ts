import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const loginPagePath = path.join(process.cwd(), "src/app/login/page.tsx");
const loginPageSource = readFileSync(loginPagePath, "utf8");

describe("login feedback page", () => {
  it("keeps the Feishu authorization entry available for account switching", () => {
    expect(loginPageSource).toContain('href="/api/auth/feishu/login"');
    expect(loginPageSource).toContain("使用飞书登录");
    expect(loginPageSource).not.toContain("customer");
    expect(loginPageSource).not.toContain("prisma");
  });

  it.each([
    ["unbound", "尚未绑定 CRM 负责人"],
    ["denied", "未通过飞书授权"],
    ["cancelled", "已取消飞书授权"],
    ["invalid_state", "授权状态校验失败"],
    ["auth_failed", "飞书授权或登录失败"],
    ["config_missing", "飞书应用或会话配置缺失"],
  ])("explains the %s callback result without business data", (code, message) => {
    expect(loginPageSource).toContain(`"${code}"`);
    expect(loginPageSource).toContain(message);
    expect(loginPageSource).not.toMatch(/客户|线索|商机|跟进记录/);
  });

  it("awaits Next.js 16 search params inside a Suspense boundary", () => {
    expect(loginPageSource).toMatch(/searchParams[^\n]*Promise</);
    expect(loginPageSource).toContain("await searchParams");
    expect(loginPageSource).toContain("<Suspense");
  });
});
