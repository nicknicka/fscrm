import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db/repositories/customer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/db/repositories/customer")>();
  return {
    ...actual,
    getCustomer: mocks.getCustomer,
    updateCustomer: mocks.updateCustomer,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateCustomerLifecycleAction } from "./lifecycle-actions";

const owner = { id: "user_owner", name: "张三", role: "OWNER" as const };
const admin = { id: "user_admin", name: "管理员", role: "ADMIN" as const };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("客户生命周期 Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.requireAdmin.mockImplementation(async () => {
      const user = await mocks.requireCurrentUser();
      if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
      return user;
    });
    mocks.getCustomer.mockResolvedValue({
      id: "customer_1",
      name: "Acme",
      lifecycle: "LEAD",
    });
    mocks.updateCustomer.mockResolvedValue({
      id: "customer_1",
      lifecycle: "RETAINED",
    });
  });

  it("管理员可以调整客户生命周期阶段", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await expect(
      updateCustomerLifecycleAction(
        "customer_1",
        form({ lifecycle: "RETAINED" })
      )
    ).resolves.toBeUndefined();

    expect(mocks.updateCustomer).toHaveBeenCalledWith(
      "customer_1",
      { lifecycle: "RETAINED" },
      { userId: admin.id, role: admin.role }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/customer_1");
  });

  it("普通负责人不能调整客户生命周期阶段", async () => {
    await expect(
      updateCustomerLifecycleAction(
        "customer_1",
        form({ lifecycle: "CHURNED" })
      )
    ).rejects.toThrow("FORBIDDEN");

    expect(mocks.updateCustomer).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("拒绝非法的生命周期阶段", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await expect(
      updateCustomerLifecycleAction("customer_1", form({ lifecycle: "BOGUS" }))
    ).rejects.toThrow("INVALID_LIFECYCLE");

    expect(mocks.updateCustomer).not.toHaveBeenCalled();
  });
});
