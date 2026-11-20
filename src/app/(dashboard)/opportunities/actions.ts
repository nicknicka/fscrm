"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOpportunity,
  deleteOpportunity,
  updateOpportunity,
} from "@/lib/db/repositories/sales";
import { getUserById } from "@/lib/db/repositories/user";
import { getCustomer } from "@/lib/db/repositories/customer";
import { requireCurrentUser } from "@/lib/auth/session";
import { notifyUser } from "@/lib/feishu/message/notify";
import { OpportunityStage } from "@/generated/prisma/enums";

/** 商机相关的 Server Actions。 */

function parseStage(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  const values = Object.values(OpportunityStage) as string[];
  return values.includes(raw)
    ? (raw as OpportunityStage)
    : OpportunityStage.CONTACT;
}

export async function createOpportunityAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!name) throw new Error("商机名称不能为空");
  if (!customerId) throw new Error("请选择关联客户");

  const amountRaw = String(formData.get("amount") ?? "").trim();
  const dateRaw = String(formData.get("expectedCloseDate") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim() || null;

  const opportunity = await createOpportunity({
    customer: { connect: { id: customerId } },
    name,
    stage: parseStage(formData.get("stage")),
    amount: amountRaw ? Number(amountRaw) : null,
    expectedCloseDate: dateRaw ? new Date(dateRaw) : null,
    remark: String(formData.get("remark") ?? "").trim() || null,
    ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
  });

  // 商机创建成功后通知负责人（失败不影响业务）
  if (ownerId) {
    const [owner, customer] = await Promise.all([
      getUserById(ownerId),
      getCustomer(customerId, { followUpViewer: await requireCurrentUser() }),
    ]);
    await notifyUser(
      owner ? { name: owner.name, feishuOpenId: owner.feishuOpenId } : null,
      "opportunity_created",
      {
        opportunityName: opportunity.name,
        customerName: customer?.name ?? "",
      }
    );
  }

  revalidatePath("/opportunities");
  redirect("/opportunities");
}

export async function updateOpportunityStageAction(
  id: string,
  formData: FormData
) {
  const stage = parseStage(formData.get("stage"));
  await updateOpportunity(id, { stage });
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${id}`);
}

export async function deleteOpportunityAction(id: string) {
  await deleteOpportunity(id);
  revalidatePath("/opportunities");
}
