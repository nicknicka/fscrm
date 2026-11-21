import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  grantAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/db/repositories/user", () => ({
  grantAdmin: mocks.grantAdmin,
  revokeAdmin: mocks.revokeAdmin,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  grantAdminAction,
  revokeAdminAction,
} from "./actions";

const owner = {
  id: "user_owner",
  name: "张三",
  role: "OWNER" as const,
};
const admin = {
  id: "user_admin",
  name: "管理员",
  role: "ADMIN" as const,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(admin);
  mocks.grantAdmin.mockResolvedValue({ ...owner, role: "ADMIN" });
  mocks.revokeAdmin.mockResolvedValue({ ...admin, role: "OWNER" });
});

describe("用户角色管理 Server Actions", () => {
  it("管理员任命负责人为管理员后刷新用户与角色页面", async () => {
    await grantAdminAction(form({ userId: "user_owner" }));

    expect(mocks.requireCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.grantAdmin).toHaveBeenCalledWith({ id: "user_owner" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/users");
  });

  it("管理员撤销管理员角色后刷新用户与角色页面", async () => {
    await revokeAdminAction(form({ userId: "user_admin" }));

    expect(mocks.requireCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.revokeAdmin).toHaveBeenCalledWith({ id: "user_admin" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/users");
  });

  it("普通负责人即使直接调用角色变更动作也被拒绝", async () => {
    mocks.requireCurrentUser.mockResolvedValue(owner);

    await expect(
      grantAdminAction(form({ userId: "user_owner" }))
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      revokeAdminAction(form({ userId: "user_admin" }))
    ).rejects.toThrow("FORBIDDEN");

    expect(mocks.grantAdmin).not.toHaveBeenCalled();
    expect(mocks.revokeAdmin).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("未登录时角色变更动作在鉴权处被拒绝", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      grantAdminAction(form({ userId: "user_owner" }))
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      revokeAdminAction(form({ userId: "user_admin" }))
    ).rejects.toThrow("UNAUTHENTICATED");

    expect(mocks.grantAdmin).not.toHaveBeenCalled();
    expect(mocks.revokeAdmin).not.toHaveBeenCalled();
  });

  it("最后一个管理员不可撤销，服务错误直接向调用方传播", async () => {
    const lastAdminError = new Error(
      "LAST_ADMIN: 不能撤销最后一个管理员：系统必须至少保留一名管理员"
    );
    mocks.revokeAdmin.mockRejectedValue(lastAdminError);

    await expect(
      revokeAdminAction(form({ userId: "user_admin" }))
    ).rejects.toThrow("LAST_ADMIN");

    expect(mocks.revokeAdmin).toHaveBeenCalledWith({ id: "user_admin" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("拒绝空用户 ID，不调用角色变更服务", async () => {
    await expect(grantAdminAction(form({ userId: "   " }))).rejects.toThrow(
      "INVALID_USER_ID"
    );
    await expect(revokeAdminAction(form({ userId: "" }))).rejects.toThrow(
      "INVALID_USER_ID"
    );

    expect(mocks.grantAdmin).not.toHaveBeenCalled();
    expect(mocks.revokeAdmin).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
