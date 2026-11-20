"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOpportunity,
  deleteOpportunity,
  updateOpportunity,
} from "@/lib/db/repositories/sales";
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

  await createOpportunity({
    customer: { connect: { id: customerId } },
    name,
    stage: parseStage(formData.get("stage")),
    amount: amountRaw ? Number(amountRaw) : null,
    expectedCloseDate: dateRaw ? new Date(dateRaw) : null,
    remark: String(formData.get("remark") ?? "").trim() || null,
  });

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
