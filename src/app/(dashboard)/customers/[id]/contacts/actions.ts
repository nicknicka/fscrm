"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor } from "@/lib/auth/scope";
import {
  createContact,
  deleteContact,
  updateContact,
  type ContactInput,
} from "@/lib/db/repositories/contact";

/**
 * 联系人 Server Actions（#31）。
 *
 * 每个入口都从签名会话重新认证，再由数据层按「所属客户」校验权限；
 * 页面上的表单显示不是安全边界。越权统一返回 NOT_FOUND 结果。
 */

/** 从表单读取联系人可写字段；姓名必填。 */
function parseContactInput(formData: FormData): ContactInput | null {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return null;
  }
  const optional = (key: string): string | null =>
    String(formData.get(key) ?? "").trim() || null;
  return {
    name,
    position: optional("position"),
    phone: optional("phone"),
    email: optional("email"),
    remark: optional("remark"),
  };
}

/** 成功后刷新客户详情页与客户列表的联系人数量。 */
function revalidateCustomer(customerId: string): void {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

/** 新建联系人。 */
export async function createContactAction(
  customerId: string,
  formData: FormData
) {
  const currentUser = await requireCurrentUser();
  const input = parseContactInput(formData);
  if (!input) {
    return { ok: false, error: "INVALID_INPUT" } as const;
  }

  const result = await createContact(
    customerId,
    input,
    accessScopeFor(currentUser)
  );
  if (result.ok) {
    revalidateCustomer(customerId);
  }
  return result;
}

/** 编辑联系人。 */
export async function updateContactAction(
  contactId: string,
  formData: FormData
) {
  const currentUser = await requireCurrentUser();
  const input = parseContactInput(formData);
  if (!input) {
    return { ok: false, error: "INVALID_INPUT" } as const;
  }

  const result = await updateContact(
    contactId,
    input,
    accessScopeFor(currentUser)
  );
  if (result.ok) {
    revalidateCustomer(result.customerId);
  }
  return result;
}

/** 删除联系人。 */
export async function deleteContactAction(contactId: string) {
  const currentUser = await requireCurrentUser();
  const result = await deleteContact(contactId, accessScopeFor(currentUser));
  if (result.ok) {
    revalidateCustomer(result.customerId);
  }
  return result;
}
