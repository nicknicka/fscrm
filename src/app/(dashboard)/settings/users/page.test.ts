import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const settingsPagePath = path.join(
  process.cwd(),
  "src/app/(dashboard)/settings/page.tsx"
);
const adminPagePath = path.join(
  process.cwd(),
  "src/app/(dashboard)/settings/users/page.tsx"
);
const settingsPageSource = readFileSync(settingsPagePath, "utf8");
const adminPageSource = readFileSync(adminPagePath, "utf8");

describe("用户与角色管理页面", () => {
  it("只在管理员会话下展示设置页入口", () => {
    expect(settingsPageSource).toContain('href="/settings/users"');
    expect(settingsPageSource).toContain('currentUser?.role === "ADMIN"');
  });

  it("用户与角色页面再次校验管理员会话并列出角色", () => {
    expect(adminPageSource).toContain("requireAdmin()");
    expect(adminPageSource).toContain("listUsers()");
    expect(adminPageSource).toContain('grantAdminAction');
    expect(adminPageSource).toContain('revokeAdminAction');
  });
});
