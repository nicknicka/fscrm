"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createLead,
  deleteLead,
  updateLead,
} from "@/lib/db/repositories/sales";
import { LeadStatus } from "@/generated/prisma/enums";

/** 线索相关的 Server Actions。 */

function parseStatus(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  const values = Object.values(LeadStatus) as string[];
  return values.includes(raw) ? (raw as LeadStatus) : LeadStatus.NEW;
}

export async function createLeadAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("线索名称不能为空");

  await createLead({
    name,
    status: parseStatus(formData.get("status")),
    source: String(formData.get("source") ?? "").trim() || null,
    contactPhone: String(formData.get("contactPhone") ?? "").trim() || null,
    contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
    remark: String(formData.get("remark") ?? "").trim() || null,
  });

  revalidatePath("/leads");
  redirect("/leads");
}

export async function updateLeadStatusAction(id: string, formData: FormData) {
  const status = parseStatus(formData.get("status"));
  await updateLead(id, { status });
  revalidatePath("/leads");
}

export async function deleteLeadAction(id: string) {
  await deleteLead(id);
  revalidatePath("/leads");
}
