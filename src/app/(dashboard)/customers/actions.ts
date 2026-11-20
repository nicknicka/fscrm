"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
} from "@/lib/db/repositories/customer";
import { CustomerLevel } from "@/generated/prisma/enums";

/**
 * 客户相关的 Server Actions。
 *
 * 表单提交后在服务端写入数据库，并刷新对应页面。
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
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("客户名称不能为空");
  }

  await createCustomer({
    name,
    level: parseLevel(formData.get("level")),
    industry: String(formData.get("industry") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    remark: String(formData.get("remark") ?? "").trim() || null,
  });

  revalidatePath("/customers");
  redirect("/customers");
}

/** 更新客户。 */
export async function updateCustomerAction(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("客户名称不能为空");
  }

  await updateCustomer(id, {
    name,
    level: parseLevel(formData.get("level")),
    industry: String(formData.get("industry") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    remark: String(formData.get("remark") ?? "").trim() || null,
  });

  revalidatePath("/customers");
  redirect("/customers");
}

/** 删除客户。 */
export async function deleteCustomerAction(id: string) {
  await deleteCustomer(id);
  revalidatePath("/customers");
}
