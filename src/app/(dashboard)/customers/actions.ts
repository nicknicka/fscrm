"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor, resolveAssignableOwnerId } from "@/lib/auth/scope";
import {
  createCustomer,
  CustomerAccessError,
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

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  return String(value ?? "").trim() || null;
}

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
  const ownerId = resolveAssignableOwnerId(
    accessScopeFor(currentUser),
    requestedOwnerId
  );
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

function rethrowCustomerAccessError(error: unknown): never {
  if (error instanceof CustomerAccessError) {
    throw new Error("NOT_FOUND");
  }
  throw error;
}

/** 从表单读取客户基本信息中可由详情页编辑的字段。 */
function parseCustomerDetailInput(formData: FormData) {
  return {
    level: parseLevel(formData.get("level")),
    industry: parseOptionalText(formData.get("industry")),
    phone: parseOptionalText(formData.get("phone")),
    email: parseOptionalText(formData.get("email")),
    address: parseOptionalText(formData.get("address")),
    remark: parseOptionalText(formData.get("remark")),
  };
}

/** 更新客户。 */
export async function updateCustomerAction(id: string, formData: FormData) {
  const currentUser = await requireCurrentUser();
  const scope = accessScopeFor(currentUser);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("客户名称不能为空");
  }

  try {
    await updateCustomer(
      id,
      {
        name,
        ...parseCustomerDetailInput(formData),
      },
      scope
    );
  } catch (error) {
    rethrowCustomerAccessError(error);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect("/customers");
}

/** 编辑客户详情页的基本信息；负责人字段由会话范围决定。 */
export async function updateCustomerDetailAction(
  id: string,
  formData: FormData
) {
  const currentUser = await requireCurrentUser();
  const scope = accessScopeFor(currentUser);
  const requestedOwnerId = parseOptionalText(formData.get("ownerId"));
  const ownerId = resolveAssignableOwnerId(scope, requestedOwnerId);

  try {
    await updateCustomer(
      id,
      {
        ...parseCustomerDetailInput(formData),
        ...(scope.role === "ADMIN" && ownerId
          ? { owner: { connect: { id: ownerId } } }
          : {}),
      },
      scope
    );
  } catch (error) {
    rethrowCustomerAccessError(error);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true as const };
}

/** 删除客户。 */
export async function deleteCustomerAction(id: string) {
  const currentUser = await requireCurrentUser();
  try {
    await deleteCustomer(id, accessScopeFor(currentUser));
  } catch (error) {
    rethrowCustomerAccessError(error);
  }
  revalidatePath("/customers");
}
