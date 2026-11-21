import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const layoutPath = path.join(process.cwd(), "src/app/(dashboard)/layout.tsx");
const sidebarPath = path.join(process.cwd(), "src/components/sidebar.tsx");
const userMenuPath = path.join(process.cwd(), "src/components/user-menu.tsx");
const layoutSource = readFileSync(layoutPath, "utf8");
const sidebarSource = readFileSync(sidebarPath, "utf8");
const userMenuSource = readFileSync(userMenuPath, "utf8");

describe("authenticated dashboard layout", () => {
  it("redirects visitors without a session to the login entry", () => {
    expect(layoutSource).toContain("getCurrentUser");
    expect(layoutSource).toContain('redirect("/login")');
  });

  it("renders the current owner and a logout control inside the sidebar", () => {
    expect(layoutSource).toContain("<UserMenu");
    expect(layoutSource).toContain("currentUser");
    expect(layoutSource).toContain("<Sidebar");
    expect(layoutSource).toContain("currentUser={currentUser}");
    expect(sidebarSource).toContain("userMenu");
    expect(userMenuSource).toContain("user.name");
    expect(userMenuSource).toContain("action={logout}");
    expect(userMenuSource).toMatch(/>\s*退出\s*<\/button>/);
  });

  it("only renders the admin users entry for an admin session", () => {
    expect(sidebarSource).toContain('href="/settings/users"');
    expect(sidebarSource).toContain('currentUser?.role === "ADMIN"');
    expect(layoutSource).toContain("currentUser={currentUser}");
  });
});
