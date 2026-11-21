"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor, resolveAssignableOwnerId } from "@/lib/auth/scope";
import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
} from "@/lib/db/repositories/customer";
import { getUserById } from "@/lib/db/repositories/user";
import { notifyUser } from "@/lib/feishu/message/notify";
import { CustomerLevel } from "@/generated/prisma/enums";

/**
 * 客户相关的 Server Actions。
 *
 * 每个入口都先读取会话取得当前负责人/管理员，再由数据层按同一范围鉴权；
 * 页面上的表单显示与布局不构成安全边界。
 */

/** 从表单数据解析客户等级，非法值回退为 MEDIUM。 */
function parseLevel(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (raw === CustomerLevel.HIGH) return CustomerLevel.HIGH;
  if (raw === CustomerLevel.LOW) return CustomerLevel.LOW;
  return CustomerLevel.MEDIUM;
}

/** 创建客户。 */
export async function createCustomerAction(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("客户名称不能为空");
  }

  const requestedOwnerId = String(formData.get("ownerId") ?? "").trim() || null;
  const ownerId = resolveAssignableOwnerId(accessScopeFor(currentUser), requestedOwnerId);
  const customer = await createCustomer(
    {
      name,
      level: parseLevel(formData.get("level")),
      industry: String(formData.get("industry") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      remark: String(formData.get("remark") ?? "").trim() || null,
      ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
    },
    accessScopeFor(currentUser)
  );

  // 客户创建成功后通知实际负责人（失败不影响业务）
  // 以仓库返回的客户对象为准，确保普通负责人伪造 ownerId 时通知仍发给真正负责人。
  const actualOwnerId = customer.ownerId ?? null;
  if (actualOwnerId) {
    const owner = await getUserById(actualOwnerId);
    await notifyUser(
      owner ? { name: owner.name, feishuOpenId: owner.feishuOpenId } : null,
      "customer_created",
      { customerName: customer.name }
    );
  }

  revalidatePath("/customers");
  redirect("/customers");
}

/** 更新客户。 */
export async function updateCustomerAction(id: string, formData: FormData) {
  const currentUser = await requireCurrentUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("客户名称不能为空");
  }

  await updateCustomer(
    id,
    {
      name,
      level: parseLevel(formData.get("level")),
      industry: String(formData.get("industry") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      remark: String(formData.get("remark") ?? "").trim() || null,
    },
    accessScopeFor(currentUser)
  );

  revalidatePath("/customers");
  redirect("/customers");
}

/** 删除客户。 */
export async function deleteCustomerAction(id: string) {
  const currentUser = await requireCurrentUser();
  await deleteCustomer(id, accessScopeFor(currentUser));
  revalidatePath("/customers");
}
