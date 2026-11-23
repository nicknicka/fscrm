"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { accessScopeFor, resolveAssignableOwnerId } from "@/lib/auth/scope";
import {
  createCustomer,
  CustomerAccessError,
  deleteCustomer,
  getCustomer,
  updateCustomer,
} from "@/lib/db/repositories/customer";
import { getUserById } from "@/lib/db/repositories/user";
import { notifyUser } from "@/lib/feishu/message/notify";
import { CustomerLevel } from "@/generated/prisma/enums";
import { createFollowUp, deleteFollowUp } from "@/lib/db/repositories/sales";
import { auditWrite } from "@/lib/db/repositories/audit-log";
import { parseFollowUpMode, parseNextFollowUpAt } from "@/lib/follow-up-form";

/**
 * 客户相关的 Server Actions。
 *
 * 每个入口都先读取会话取得当前负责人/管理员，再由数据层按同一范围鉴权；
 * 页面上的表单显示与布局不构成安全边界。
 */

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  return String(value ?? "").trim() || null;
}

/** 从表单数据解析客户等级；未提供或非法时返回 undefined。 */
function parseLevel(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (raw === CustomerLevel.HIGH) return CustomerLevel.HIGH;
  if (raw === CustomerLevel.LOW) return CustomerLevel.LOW;
  if (raw === CustomerLevel.MEDIUM) return CustomerLevel.MEDIUM;
  return undefined;
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
      level: parseLevel(formData.get("level")) ?? CustomerLevel.MEDIUM,
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

  await auditWrite(
    currentUser,
    "CREATE",
    "Customer",
    customer.id,
    `新建客户「${customer.name}」`
  );

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
function parseCustomerDetailInput(
  formData: FormData
): Parameters<typeof updateCustomer>[1] {
  const level = parseLevel(formData.get("level"));
  const data: Parameters<typeof updateCustomer>[1] = {};
  if (level) data.level = level;
  for (const field of [
    "industry",
    "phone",
    "email",
    "address",
    "remark",
  ] as const) {
    if (formData.has(field)) {
      data[field] = parseOptionalText(formData.get(field));
    }
  }
  return data;
}

/** 更新客户。详情表单不含 name，缺失字段保持原值。 */
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
    // 以范围内读取到的现有值为基底，表单未提交的字段保持原值；
    // 其中 level 不使用 MEDIUM 默认，避免管理员改负责人时误重置等级。
    const current = await getCustomer(id, scope);
    if (!current) {
      throw new CustomerAccessError();
    }
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
  await auditWrite(currentUser, "DELETE", "Customer", id, "删除客户");
  revalidatePath("/customers");
}

/** 客户详情新增跟进；权限校验由 createFollowUp 仓储层统一完成。 */
export async function createCustomerFollowUpAction(
  customerId: string,
  formData: FormData
) {
  const currentUser = await requireCurrentUser();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    throw new Error("跟进内容不能为空");
  }

  await createFollowUp(
    {
      customer: { connect: { id: customerId } },
      mode: parseFollowUpMode(formData.get("mode")),
      content,
      nextFollowUpAt: parseNextFollowUpAt(formData.get("nextFollowUpAt")),
    },
    currentUser
  );

  revalidatePath(`/customers/${customerId}`);
}

/** 把仓储层的拒绝统一映射成 NOT_FOUND，避免泄露跟进是否存在。 */
function rethrowFollowUpDeleteResult(deleted: boolean | { id: string }): void {
  if (!deleted) {
    throw new Error("NOT_FOUND");
  }
}

/** 客户详情删除跟进；越权/不存在由仓储层统一拒绝。 */
export async function deleteCustomerFollowUpAction(
  customerId: string,
  followUpId: string
) {
  const currentUser = await requireCurrentUser();
  let deleted;
  try {
    deleted = await deleteFollowUp(followUpId, currentUser);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      throw new Error("NOT_FOUND");
    }
    throw error;
  }
  rethrowFollowUpDeleteResult(deleted);
  revalidatePath(`/customers/${customerId}`);
}
