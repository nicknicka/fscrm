import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  customer: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  claimPublicCustomer,
  setCustomerOwner,
} from "./customer";

const owner = { userId: "user_owner", role: "OWNER" as const };
const admin = { userId: "user_admin", role: "ADMIN" as const };

describe("public pool customer repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims an unassigned customer with a conditional atomic update", async () => {
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      id: "customer_1",
      name: "Acme",
      ownerId: owner.userId,
    });

    const claimed = await claimPublicCustomer("customer_1", owner);

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_1", ownerId: null },
      data: { ownerId: owner.userId },
    });
    expect(claimed.ownerId).toBe(owner.userId);
  });

  it("rejects a double claim when the conditional update matches no row", async () => {
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      claimPublicCustomer("customer_1", owner)
    ).rejects.toThrow("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");
    expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
  });

  it("does not let an administrator bypass the unassigned claim guard", async () => {
    await expect(
      claimPublicCustomer("customer_1", admin)
    ).rejects.toThrow("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");
    expect(prismaMock.customer.updateMany).not.toHaveBeenCalled();
  });

  it("lets an administrator clear the owner and move a customer into the pool", async () => {
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      id: "customer_1",
      ownerId: null,
    });

    await setCustomerOwner("customer_1", null, admin);

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_1" },
      data: { ownerId: null },
    });
  });

  it("lets an administrator assign an owner", async () => {
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.customer.findUnique.mockResolvedValueOnce({
      id: "customer_1",
      ownerId: owner.userId,
    });

    await setCustomerOwner("customer_1", owner.userId, admin);

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_1" },
      data: { ownerId: owner.userId },
    });
  });

  it("hides foreign or missing customers behind the unified error", async () => {
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      setCustomerOwner("customer_foreign", owner.userId, owner)
    ).rejects.toThrow("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");
    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_foreign", ownerId: owner.userId },
      data: { ownerId: owner.userId },
    });
  });
});
