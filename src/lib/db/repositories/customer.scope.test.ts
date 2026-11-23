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
  fieldPermission: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  listPublicPoolCustomers,
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

    expect(
      prismaMock.customer.findMany.mock.calls[0][0].where
    ).not.toHaveProperty("ownerId");
    expect(prismaMock.customer.findMany.mock.calls[1][0].where).toHaveProperty(
      "ownerId",
      owner.userId
    );
  });

  it("lets an administrator list the public pool of customers without an owner", async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([]);

    await listCustomers({ unassignedOnly: true }, admin);

    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: null } })
    );
  });

  it("gives an ordinary owner only the minimal public-pool fields, with no sensitive details or relations", async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([]);

    await listPublicPoolCustomers(owner);

    const call = prismaMock.customer.findMany.mock.calls.at(-1)?.[0];
    expect(call?.where).toEqual({ ownerId: null });
    expect(call?.select).toEqual({
      id: true,
      name: true,
      level: true,
      industry: true,
    });
    expect(call).not.toHaveProperty("include");
    const selected = Object.keys(call?.select ?? {});
    for (const sensitive of ["phone", "email", "address", "remark", "owner"]) {
      expect(selected).not.toContain(sensitive);
    }
  });

  it("lets an administrator see the full public pool rows with relation counts", async () => {
    prismaMock.customer.findMany.mockResolvedValueOnce([]);

    await listPublicPoolCustomers(admin);

    const call = prismaMock.customer.findMany.mock.calls.at(-1)?.[0];
    expect(call?.where).toEqual({ ownerId: null });
    expect(call).not.toHaveProperty("select");
    expect(call).toHaveProperty("include");
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

  it("does not search by phone or email when the role cannot see those fields", async () => {
    prismaMock.fieldPermission.findMany.mockResolvedValueOnce([
      { role: "OWNER", entity: "Customer", field: "phone", visible: false },
      { role: "OWNER", entity: "Customer", field: "email", visible: false },
      { role: "OWNER", entity: "Customer", field: "address", visible: false },
    ]);
    prismaMock.customer.findMany.mockResolvedValueOnce([]);

    await listCustomers({ search: "138000" }, owner);

    const where = prismaMock.customer.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: "138000", mode: "insensitive" } },
    ]);
  });

  it("drops hidden sensitive fields from an ordinary owner's update so masked values cannot be overwritten", async () => {
    prismaMock.fieldPermission.findMany.mockResolvedValueOnce([
      { role: "OWNER", entity: "Customer", field: "phone", visible: true },
      { role: "OWNER", entity: "Customer", field: "email", visible: false },
      { role: "OWNER", entity: "Customer", field: "address", visible: true },
    ]);
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.customer.findUnique.mockResolvedValueOnce({ id: "customer_1" });

    await updateCustomer(
      "customer_1",
      {
        name: "Acme",
        phone: "138000",
        email: "forged@example.com",
        address: "北京",
      },
      owner
    );

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_1", ownerId: owner.userId },
      data: { name: "Acme", phone: "138000", address: "北京" },
    });
  });

  it("drops hidden sensitive fields for all non-admin roles, not just OWNER", async () => {
    prismaMock.fieldPermission.findMany.mockResolvedValueOnce([
      { role: "MANAGER", entity: "Customer", field: "phone", visible: false },
    ]);
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.customer.findUnique.mockResolvedValueOnce({ id: "customer_1" });

    await updateCustomer(
      "customer_1",
      { phone: "forged" },
      { userId: "u1", role: "MANAGER" as never }
    );

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_1", ownerId: "u1" },
      data: {},
    });
    expect(prismaMock.fieldPermission.findMany).toHaveBeenCalledWith({
      where: { entity: "Customer", role: "MANAGER" },
    });
  });

  it("keeps all sensitive fields for an administrator update", async () => {
    prismaMock.customer.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.customer.findUnique.mockResolvedValueOnce({ id: "customer_1" });

    await updateCustomer("customer_1", { email: "admin@example.com" }, admin);

    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { id: "customer_1" },
      data: { email: "admin@example.com" },
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

    await expect(
      deleteCustomer("customer_foreign", owner)
    ).rejects.toMatchObject({ name: "CustomerAccessError" });

    expect(prismaMock.customer.delete).not.toHaveBeenCalled();
  });

  it("limits assignable owners for the customer form by role", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await listAssignableUsers({
      id: "user_owner",
      name: "张三",
      role: "OWNER",
    });
    await listAssignableUsers({
      id: "user_admin",
      name: "管理员",
      role: "ADMIN",
    });

    expect(prismaMock.user.findMany.mock.calls[0][0]).toHaveProperty("where", {
      id: owner.userId,
    });
    expect(prismaMock.user.findMany.mock.calls[1][0]).toHaveProperty(
      "where",
      {}
    );
  });
});
