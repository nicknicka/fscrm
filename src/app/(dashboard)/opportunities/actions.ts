"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  createOpportunity,
  deleteOpportunity,
  updateOpportunity,
} from "@/lib/db/repositories/sales";
import { getUserById } from "@/lib/db/repositories/user";
import { getCustomer } from "@/lib/db/repositories/customer";
import {
  accessScopeFor,
  resolveAssignableOwnerId,
  type AccessScope,
} from "@/lib/auth/scope";
import { notifyUser } from "@/lib/feishu/message/notify";
import { OpportunityStage } from "@/generated/prisma/enums";

/** 商机相关的 Server Actions。每个入口都从会话重新认证并授权。 */

// #17 将收敛商机自身权限；这里只需用管理员范围读取关联客户名称用于通知。
const CUSTOMER_LOOKUP_SCOPE: AccessScope = {
  userId: "system",
  role: "ADMIN",
};

function parseStage(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  const values = Object.values(OpportunityStage) as string[];
  return values.includes(raw)
    ? (raw as OpportunityStage)
    : OpportunityStage.CONTACT;
}

/** 把仓储层的越权/不存在拒绝统一映射为 NOT_FOUND。 */
function rethrowOpportunityAccessError(error: unknown): never {
  if (
    error instanceof Error &&
    (error.message === "FORBIDDEN" || error.message === "NOT_FOUND")
  ) {
    throw new Error("NOT_FOUND");
  }
  throw error;
}

/** 编辑商机基本信息；普通负责人的 owner 字段被忽略。 */
export async function updateOpportunityAction(id: string, formData: FormData) {
  const user = await requireCurrentUser();
  const scope = accessScopeFor(user);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("商机名称不能为空");

  const amountRaw = String(formData.get("amount") ?? "").trim();
  const dateRaw = String(formData.get("expectedCloseDate") ?? "").trim();
  const requestedOwnerId = String(formData.get("ownerId") ?? "").trim() || null;
  const ownerId = resolveAssignableOwnerId(scope, requestedOwnerId);

  try {
    await updateOpportunity(
      id,
      {
        name,
        amount: amountRaw ? Number(amountRaw) : null,
        expectedCloseDate: dateRaw ? new Date(dateRaw) : null,
        remark: String(formData.get("remark") ?? "").trim() || null,
        ...(scope.role === "ADMIN" && ownerId
          ? { owner: { connect: { id: ownerId } } }
          : {}),
      },
      user
    );
  } catch (error) {
    rethrowOpportunityAccessError(error);
  }

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
  return { ok: true as const };
}

export async function createOpportunityAction(formData: FormData) {
  const user = await requireCurrentUser();
  const name = String(formData.get("name") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!name) throw new Error("商机名称不能为空");
  if (!customerId) throw new Error("请选择关联客户");

  const amountRaw = String(formData.get("amount") ?? "").trim();
  const dateRaw = String(formData.get("expectedCloseDate") ?? "").trim();
  const requestedOwnerId = String(formData.get("ownerId") ?? "").trim();
  const actualOwnerId =
    user.role === "ADMIN" ? requestedOwnerId || user.id : user.id;

  const opportunity = await createOpportunity(
    {
      customer: { connect: { id: customerId } },
      name,
      stage: parseStage(formData.get("stage")),
      amount: amountRaw ? Number(amountRaw) : null,
      expectedCloseDate: dateRaw ? new Date(dateRaw) : null,
      remark: String(formData.get("remark") ?? "").trim() || null,
      owner: { connect: { id: actualOwnerId } },
    },
    user
  );

  // 商机创建成功后通知实际负责人（失败不影响业务）
  const [owner, customer] = await Promise.all([
    getUserById(actualOwnerId),
    getCustomer(customerId, CUSTOMER_LOOKUP_SCOPE),
  ]);
  await notifyUser(
    owner ? { name: owner.name, feishuOpenId: owner.feishuOpenId } : null,
    "opportunity_created",
    {
      opportunityName: opportunity.name,
      customerName: customer?.name ?? "",
    }
  );

  revalidatePath("/opportunities");
  redirect("/opportunities");
}

export async function updateOpportunityStageAction(
  id: string,
  formData: FormData
) {
  const user = await requireCurrentUser();
  const stage = parseStage(formData.get("stage"));
  await updateOpportunity(id, { stage }, user);
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
}

export async function deleteOpportunityAction(id: string) {
  const user = await requireCurrentUser();
  await deleteOpportunity(id, user);
  revalidatePath("/opportunities");
}
