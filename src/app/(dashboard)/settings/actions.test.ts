import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  runContactSync: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/services/contact-sync", () => ({
  runContactSync: mocks.runContactSync,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { syncContactsAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("通讯录同步 Server Action 权限", () => {
  it("未登录时拒绝同步且不调用飞书同步逻辑", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(syncContactsAction()).rejects.toThrow("UNAUTHENTICATED");
    expect(mocks.runContactSync).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("已登录用户可以同步通讯录", async () => {
    mocks.requireCurrentUser.mockResolvedValue({
      id: "user_owner",
      name: "张三",
      role: "OWNER",
    });
    mocks.runContactSync.mockResolvedValue({ ok: true });

    await expect(syncContactsAction()).resolves.toEqual({ ok: true });
    expect(mocks.runContactSync).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });
});
