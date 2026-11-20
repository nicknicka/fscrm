"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createLead,
  deleteLead,
  updateLead,
  BusinessObjectNotFoundError,
} from "@/lib/db/repositories/sales";
import { accessScopeFor } from "@/lib/auth/scope";
import { getCurrentUser } from "@/lib/auth/session";
import { LeadStatus } from "@/generated/prisma/enums";

/** 线索相关的 Server Actions。 */

function parseStatus(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  const values = Object.values(LeadStatus) as string[];
  return values.includes(raw) ? (raw as LeadStatus) : LeadStatus.NEW;
}

async function requireScope() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return accessScopeFor(user);
}

function leadAccessError(error: unknown): never {
  if (error instanceof BusinessObjectNotFoundError) {
    throw new Error("NOT_FOUND");
  }
  throw error;
}

export async function createLeadAction(formData: FormData) {
  const scope = await requireScope();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("线索名称不能为空");

  await createLead(
    {
      name,
      status: parseStatus(formData.get("status")),
      source: String(formData.get("source") ?? "").trim() || null,
      contactPhone: String(formData.get("contactPhone") ?? "").trim() || null,
      contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
      remark: String(formData.get("remark") ?? "").trim() || null,
    },
    scope
  );

  revalidatePath("/leads");
  redirect("/leads");
}

export async function updateLeadStatusAction(id: string, formData: FormData) {
  const scope = await requireScope();
  const status = parseStatus(formData.get("status"));
  try {
    await updateLead(id, { status }, scope);
  } catch (error) {
    leadAccessError(error);
  }
  revalidatePath("/leads");
}

export async function deleteLeadAction(id: string) {
  const scope = await requireScope();
  try {
    await deleteLead(id, scope);
  } catch (error) {
    leadAccessError(error);
  }
  revalidatePath("/leads");
}
