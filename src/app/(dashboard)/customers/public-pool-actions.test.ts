import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimPublicCustomer: vi.fn(),
  setCustomerOwner: vi.fn(),
  getUserById: vi.fn(),
  notifyUser: vi.fn(),
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  CustomerAccessError: class CustomerAccessError extends Error {
    constructor() {
      super("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");
      this.name = "CustomerAccessError";
    }
  },
}));

vi.mock("@/lib/db/repositories/customer", () => ({
  claimPublicCustomer: mocks.claimPublicCustomer,
  setCustomerOwner: mocks.setCustomerOwner,
  CustomerAccessError: mocks.CustomerAccessError,
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

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  claimPublicCustomerAction,
  setCustomerOwnerAction,
} from "./public-pool-actions";

const owner = { id: "user_owner", name: "张三", role: "OWNER" as const };
const otherOwner = {
  id: "user_other",
  name: "李四",
  role: "OWNER" as const,
};
const admin = { id: "user_admin", name: "管理员", role: "ADMIN" as const };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("public pool Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.claimPublicCustomer.mockResolvedValue({
      id: "customer_1",
      name: "Acme",
      ownerId: owner.id,
    });
    mocks.setCustomerOwner.mockResolvedValue({
      id: "customer_1",
      name: "Acme",
      ownerId: otherOwner.id,
    });
    mocks.getUserById.mockResolvedValue({
      name: "张三",
      feishuOpenId: "ou_owner",
    });
    mocks.notifyUser.mockResolvedValue({ sent: true });
  });

  it("lets an owner claim an unassigned customer and notifies the new owner", async () => {
    await claimPublicCustomerAction("customer_1");

    expect(mocks.claimPublicCustomer).toHaveBeenCalledWith("customer_1", {
      userId: owner.id,
      role: owner.role,
    });
    expect(mocks.getUserById).toHaveBeenCalledWith(owner.id);
    expect(mocks.notifyUser).toHaveBeenCalledWith(
      { name: "张三", feishuOpenId: "ou_owner" },
      "customer_created",
      { customerName: "Acme" }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/public-pool");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers");
  });

  it("rejects a double claim without revalidating or notifying", async () => {
    mocks.claimPublicCustomer.mockRejectedValueOnce(
      new Error("CUSTOMER_ALREADY_CLAIMED")
    );

    await expect(claimPublicCustomerAction("customer_1")).rejects.toThrow(
      "NOT_FOUND"
    );

    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("hides cross-scope claim attempts behind NOT_FOUND", async () => {
    const { CustomerAccessError } =
      await import("@/lib/db/repositories/customer");
    mocks.claimPublicCustomer.mockRejectedValueOnce(new CustomerAccessError());

    await expect(claimPublicCustomerAction("customer_1")).rejects.toThrow(
      "NOT_FOUND"
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("still claims when notification fails", async () => {
    mocks.notifyUser.mockRejectedValueOnce(new Error("feishu unavailable"));

    await expect(claimPublicCustomerAction("customer_1")).resolves.toBeUndefined();
    expect(mocks.claimPublicCustomer).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/public-pool");
  });

  it("lets an administrator move a customer into the public pool", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);
    mocks.setCustomerOwner.mockResolvedValue({
      id: "customer_1",
      name: "Acme",
      ownerId: null,
    });

    await setCustomerOwnerAction("customer_1", form({ ownerId: "" }));

    expect(mocks.setCustomerOwner).toHaveBeenCalledWith(
      "customer_1",
      null,
      { userId: admin.id, role: admin.role }
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/public-pool");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/customer_1");
  });

  it("lets an administrator assign an owner", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);

    await setCustomerOwnerAction(
      "customer_1",
      form({ ownerId: otherOwner.id })
    );

    expect(mocks.setCustomerOwner).toHaveBeenCalledWith(
      "customer_1",
      otherOwner.id,
      { userId: admin.id, role: admin.role }
    );
  });

  it("rejects an ordinary owner attempting to change ownership", async () => {
    const { CustomerAccessError } =
      await import("@/lib/db/repositories/customer");
    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.setCustomerOwner.mockRejectedValueOnce(new CustomerAccessError());

    await expect(
      setCustomerOwnerAction("customer_1", form({ ownerId: admin.id }))
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.setCustomerOwner).toHaveBeenCalledWith(
      "customer_1",
      owner.id,
      { userId: owner.id, role: owner.role }
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
