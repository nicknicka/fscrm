import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/** 模拟会话与用户列表，验证页面按角色呈现不同结果。 */
const { getCurrentUserMock, listUsersMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  listUsersMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/db/repositories/user", () => ({ listUsers: listUsersMock }));
vi.mock("./actions", () => ({
  grantAdminAction: vi.fn(),
  revokeAdminAction: vi.fn(),
}));

import AdminUsersPage from "./page";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  listUsersMock.mockReset();
});

describe("用户与角色页面", () => {
  it("管理员可见用户列表与角色", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u1",
      name: "甲",
      role: "ADMIN",
    });
    listUsersMock.mockResolvedValue([
      { id: "u1", name: "甲", role: "ADMIN", email: null },
      { id: "u2", name: "乙", role: "OWNER", email: null },
    ]);

    const html = renderToStaticMarkup(await AdminUsersPage());
    expect(html).toContain("甲");
    expect(html).toContain("乙");
    expect(html).toContain("管理员");
  });

  it("普通负责人只看到无权限说明，拿不到用户列表", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u2",
      name: "乙",
      role: "OWNER",
    });

    const html = renderToStaticMarkup(await AdminUsersPage());
    expect(html).toContain("没有访问权限");
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("未登录同样被拒绝", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const html = renderToStaticMarkup(await AdminUsersPage());
    expect(html).toContain("没有访问权限");
    expect(listUsersMock).not.toHaveBeenCalled();
  });
});
