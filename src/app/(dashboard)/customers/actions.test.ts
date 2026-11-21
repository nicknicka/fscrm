import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  getUserById: vi.fn(),
  notifyUser: vi.fn(),
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  resolveAssignableOwnerId: vi.fn(),
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  deleteCustomer: mocks.deleteCustomer,
  CustomerAccessError: class CustomerAccessError extends Error {},
}));

vi.mock("@/lib/db/repositories/user", () => ({
  getUserById: mocks.getUserById,
}));

vi.mock("@/lib/feishu/message/notify", () => ({
  notifyUser: mocks.notifyUser,
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/auth/scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/scope")>();
  return { ...actual, resolveAssignableOwnerId: mocks.resolveAssignableOwnerId };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from "./actions";

const owner = { id: "user_owner", name: "张三", role: "OWNER" as const };
const admin = { id: "user_admin", name: "管理员", role: "ADMIN" as const };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("customer Server Actions authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.resolveAssignableOwnerId.mockImplementation(
      (scope: { userId: string; role: "OWNER" | "ADMIN" }, requested: string | null) =>
        scope.role === "ADMIN" ? requested : scope.userId
    );
    mocks.getUserById.mockResolvedValue({
      name: "张三",
      feishuOpenId: "ou_owner",
    });
    mocks.notifyUser.mockResolvedValue({ sent: true });
    mocks.createCustomer.mockResolvedValue({
      id: "customer_1",
      name: "Acme",
      ownerId: owner.id,
    });
  });

  it("creates a customer for the signed-in owner and notifies the actual owner", async () => {
    await createCustomerAction(
      form({ name: "Acme", ownerId: "user_admin" })
    );

    expect(mocks.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Acme",
        owner: { connect: { id: owner.id } },
      }),
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.getUserById).toHaveBeenCalledWith(owner.id);
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      { name: "张三", feishuOpenId: "ou_owner" },
      "customer_created",
      { customerName: "Acme" }
    );
  });

  it("lets an administrator choose a different owner and still notify that owner", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);
    mocks.getUserById.mockResolvedValue({
      name: "李四",
      feishuOpenId: "ou_other",
    });
    mocks.createCustomer.mockResolvedValue({
      id: "customer_2",
      name: "Beta",
      ownerId: owner.id,
    });

    await createCustomerAction(
      form({ name: "Beta", ownerId: "user_owner" })
    );

    expect(mocks.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { connect: { id: "user_owner" } },
      }),
      { userId: admin.id, role: admin.role }
    );
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      { name: "李四", feishuOpenId: "ou_other" },
      "customer_created",
      { customerName: "Beta" }
    );
  });

  it("authenticates before every create, update and delete action", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));
    mocks.updateCustomer.mockResolvedValue({ id: "customer_1" });
    mocks.deleteCustomer.mockResolvedValue({ id: "customer_1" });

    await expect(
      createCustomerAction(form({ name: "Acme" }))
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      updateCustomerAction("customer_1", form({ name: "Acme" }))
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(deleteCustomerAction("customer_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );

    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.updateCustomer).not.toHaveBeenCalled();
    expect(mocks.deleteCustomer).not.toHaveBeenCalled();
  });

  it("passes the current scope into update and delete actions", async () => {
    mocks.updateCustomer.mockResolvedValue({ id: "customer_1" });
    mocks.deleteCustomer.mockResolvedValue({ id: "customer_1" });

    await updateCustomerAction("customer_1", form({ name: "Acme" }));
    await deleteCustomerAction("customer_1");

    expect(mocks.updateCustomer).toHaveBeenCalledWith(
      "customer_1",
      expect.objectContaining({ name: "Acme" }),
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.deleteCustomer).toHaveBeenCalledWith("customer_1", {
      userId: owner.id,
      role: owner.role,
    });
  });
});
