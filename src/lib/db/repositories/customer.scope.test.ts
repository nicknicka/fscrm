import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  customer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "./customer";
import { listAssignableUsers } from "./user";

const owner = { userId: "user_owner", role: "OWNER" as const };
const admin = { userId: "user_admin", role: "ADMIN" as const };

describe("customer repository access scope", () => {
  it("lists only the current owner's customers and ignores a forged owner filter", async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([]);

    await listCustomers({ ownerId: admin.userId }, owner);

    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: owner.userId }),
      })
    );
  });

  it("lets an administrator keep an explicit owner filter while viewing all customers by default", async () => {
    prismaMock.customer.findMany.mockResolvedValue([]);

    await listCustomers({}, admin);
    await listCustomers({ ownerId: owner.userId }, admin);

    expect(prismaMock.customer.findMany.mock.calls[0][0].where).not.toHaveProperty(
      "ownerId"
    );
    expect(prismaMock.customer.findMany.mock.calls[1][0].where).toHaveProperty(
      "ownerId",
      owner.userId
    );
  });

  it("queries customer details with the owner constraint and hides unrelated opportunities", async () => {
    prismaMock.customer.findFirst.mockResolvedValueOnce(null);

    await expect(getCustomer("customer_1", owner)).resolves.toBeNull();

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "customer_1", ownerId: owner.userId },
        include: expect.objectContaining({
          opportunities: { where: { ownerId: owner.userId } },
        }),
      })
    );
  });

  it("forces an ordinary owner to keep the customer and ignores a forged owner selection", async () => {
    prismaMock.customer.create.mockResolvedValueOnce({ id: "customer_1" });

    await createCustomer(
      {
        name: "Acme",
        owner: { connect: { id: admin.userId } },
      },
      owner
    );

    expect(prismaMock.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Acme",
        owner: { connect: { id: owner.userId } },
      }),
    });
  });

  it("allows an administrator to assign a customer to another owner", async () => {
    prismaMock.customer.create.mockResolvedValueOnce({ id: "customer_1" });

    await createCustomer(
      { name: "Beta", owner: { connect: { id: owner.userId } } },
      admin
    );

    expect(prismaMock.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        owner: { connect: { id: owner.userId } },
      }),
    });
  });

  it("rejects updating someone else's customer without changing it", async () => {
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateCustomer("customer_foreign", { name: "篡改" }, owner)
    ).rejects.toThrow("CUSTOMER_NOT_FOUND_OR_FORBIDDEN");

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_foreign", ownerId: owner.userId },
      data: { name: "篡改" },
    });
    expect(prismaMock.customer.update).not.toHaveBeenCalled();
  });

  it("rejects deleting a customer the current owner cannot access", async () => {
    prismaMock.customer.findFirst.mockResolvedValueOnce(null);

    await expect(deleteCustomer("customer_foreign", owner)).rejects.toMatchObject(
      { name: "CustomerAccessError" }
    );

    expect(prismaMock.customer.delete).not.toHaveBeenCalled();
  });

  it("limits assignable owners for the customer form by role", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await listAssignableUsers({ id: "user_owner", name: "张三", role: "OWNER" });
    await listAssignableUsers({ id: "user_admin", name: "管理员", role: "ADMIN" });

    expect(prismaMock.user.findMany.mock.calls[0][0]).toHaveProperty(
      "where",
      { id: owner.userId }
    );
    expect(prismaMock.user.findMany.mock.calls[1][0]).toHaveProperty("where", {});
  });
});
