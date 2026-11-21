import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #31 联系人 Server Action 外部行为测试。
 *
 * 测试只看 Server Action 这一公开边界：谁被调用、传入什么权限范围、
 * 越权时返回什么统一结果、成功后是否刷新客户详情页。
 */

const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/db/repositories/contact", () => ({
  createContact: mocks.createContact,
  updateContact: mocks.updateContact,
  deleteContact: mocks.deleteContact,
}));

import {
  createContactAction,
  deleteContactAction,
  updateContactAction,
} from "./actions";

const owner = { id: "user_owner", name: "张三", role: "OWNER" as const };
const otherOwner = { id: "user_other", name: "李四", role: "OWNER" as const };
const admin = { id: "user_admin", name: "管理员", role: "ADMIN" as const };

const contact = {
  id: "contact_1",
  customerId: "customer_own",
  name: "王五",
  position: "采购经理",
  phone: "13800000000",
  email: "wang@example.com",
  remark: "决策人",
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function contactForm(overrides: Record<string, string> = {}): FormData {
  return form({
    name: contact.name,
    position: contact.position,
    phone: contact.phone,
    email: contact.email,
    remark: contact.remark,
    ...overrides,
  });
}

describe("联系人 Server Actions 权限与刷新", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(owner);
    mocks.createContact.mockResolvedValue({
      ok: true,
      customerId: "customer_own",
      contact,
    });
    mocks.updateContact.mockResolvedValue({
      ok: true,
      customerId: "customer_own",
      contact,
    });
    mocks.deleteContact.mockResolvedValue({
      ok: true,
      customerId: "customer_own",
    });
  });

  it("负责人在自己负责的客户下新增、编辑、删除联系人，并刷新详情页", async () => {
    const scope = { userId: owner.id, role: owner.role };

    const created = await createContactAction("customer_own", contactForm());
    expect(created).toEqual({
      ok: true,
      customerId: "customer_own",
      contact,
    });
    expect(mocks.createContact).toHaveBeenCalledWith(
      "customer_own",
      {
        name: contact.name,
        position: contact.position,
        phone: contact.phone,
        email: contact.email,
        remark: contact.remark,
      },
      scope
    );

    const updated = await updateContactAction(
      "contact_1",
      contactForm({ name: "王六" })
    );
    expect(updated).toEqual({
      ok: true,
      customerId: "customer_own",
      contact,
    });
    expect(mocks.updateContact).toHaveBeenCalledWith(
      "contact_1",
      expect.objectContaining({ name: "王六" }),
      scope
    );

    const deleted = await deleteContactAction("contact_1");
    expect(deleted).toEqual({ ok: true, customerId: "customer_own" });
    expect(mocks.deleteContact).toHaveBeenCalledWith("contact_1", scope);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers/customer_own");
  });

  it("普通负责人对他人客户的新增、编辑、删除统一返回 NOT_FOUND，且不刷新", async () => {
    mocks.requireCurrentUser.mockResolvedValue(otherOwner);
    mocks.createContact.mockResolvedValue(NOT_FOUND);
    mocks.updateContact.mockResolvedValue(NOT_FOUND);
    mocks.deleteContact.mockResolvedValue(NOT_FOUND);

    await expect(
      createContactAction("customer_own", contactForm())
    ).resolves.toEqual(NOT_FOUND);
    await expect(
      updateContactAction("contact_1", contactForm())
    ).resolves.toEqual(NOT_FOUND);
    await expect(deleteContactAction("contact_1")).resolves.toEqual(NOT_FOUND);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("管理员可维护任意客户的联系人", async () => {
    mocks.requireCurrentUser.mockResolvedValue(admin);
    const scope = { userId: admin.id, role: admin.role };

    await createContactAction("customer_foreign", contactForm());
    await updateContactAction("contact_foreign_1", contactForm());
    await deleteContactAction("contact_foreign_1");

    expect(mocks.createContact).toHaveBeenCalledWith(
      "customer_foreign",
      expect.any(Object),
      scope
    );
    expect(mocks.updateContact).toHaveBeenCalledWith(
      "contact_foreign_1",
      expect.any(Object),
      scope
    );
    expect(mocks.deleteContact).toHaveBeenCalledWith("contact_foreign_1", scope);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/customers/customer_foreign"
    );
  });

  it("每个入口都先校验当前会话", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("UNAUTHENTICATED"));

    await expect(
      createContactAction("customer_own", contactForm())
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      updateContactAction("contact_1", contactForm())
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(deleteContactAction("contact_1")).rejects.toThrow(
      "UNAUTHENTICATED"
    );

    expect(mocks.createContact).not.toHaveBeenCalled();
    expect(mocks.updateContact).not.toHaveBeenCalled();
    expect(mocks.deleteContact).not.toHaveBeenCalled();
  });

  it("姓名为空时不写入联系人", async () => {
    await expect(
      createContactAction("customer_own", contactForm({ name: "   " }))
    ).resolves.toEqual({ ok: false, error: "INVALID_INPUT" });
    expect(mocks.createContact).not.toHaveBeenCalled();
  });
});
