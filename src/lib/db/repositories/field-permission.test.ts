import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  fieldPermission: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: prismaMock }));

import {
  CUSTOMER_SENSITIVE_FIELDS,
  maskCustomerFields,
  saveFieldPermissions,
  visibleCustomerFields,
} from "./field-permission";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
    Promise.all(ops)
  );
  prismaMock.fieldPermission.findMany.mockResolvedValue([
    { role: "OWNER", entity: "Customer", field: "phone", visible: true },
    { role: "OWNER", entity: "Customer", field: "email", visible: false },
  ]);
});

describe("字段级权限", () => {
  it("管理员始终可见全部字段", async () => {
    expect(await visibleCustomerFields("ADMIN")).toEqual(
      new Set(CUSTOMER_SENSITIVE_FIELDS)
    );
  });

  it("负责人按配置取可见字段，无配置时默认全可见", async () => {
    const visible = await visibleCustomerFields("OWNER");
    expect(visible.has("phone")).toBe(true);
    expect(visible.has("email")).toBe(false);

    prismaMock.fieldPermission.findMany.mockResolvedValue([]);
    expect((await visibleCustomerFields("OWNER")).size).toBe(3);
  });

  it("遮蔽不可见字段为 null，不修改原对象", () => {
    const customer = {
      name: "云启",
      phone: "138000",
      email: "a@b.com",
      address: "北京",
    };
    const visible = new Set<"phone" | "email" | "address">([
      "phone",
      "address",
    ]);
    const masked = maskCustomerFields(customer, visible);
    expect(masked.phone).toBe("138000");
    expect(masked.email).toBeNull();
    expect(customer.email).toBe("a@b.com");
  });

  it("保存按角色+对象整体覆盖，三字段都写入", async () => {
    await saveFieldPermissions("OWNER" as never, ["phone"]);
    expect(prismaMock.fieldPermission.deleteMany).toHaveBeenCalledWith({
      where: { entity: "Customer", role: "OWNER" },
    });
    expect(prismaMock.fieldPermission.create).toHaveBeenCalledTimes(3);
  });
});
