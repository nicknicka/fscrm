"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createLead,
  deleteLead,
  updateLead,
  BusinessObjectNotFoundError,
} from "@/lib/db/repositories/sales";
import { accessScopeFor, resolveAssignableOwnerId } from "@/lib/auth/scope";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { getUserById } from "@/lib/db/repositories/user";
import { LeadStatus } from "@/generated/prisma/enums";

/** 线索相关的 Server Actions。 */

function parseStatus(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  const values = Object.values(LeadStatus) as string[];
  return values.includes(raw) ? (raw as LeadStatus) : LeadStatus.NEW;
}

async function requireScope(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

function leadAccessError(error: unknown): never {
  if (error instanceof BusinessObjectNotFoundError) {
    throw new Error("NOT_FOUND");
  }
  throw error;
}

export async function createLeadAction(formData: FormData) {
  const currentUser = await requireScope();
  const scope = accessScopeFor(currentUser);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("线索名称不能为空");

  const requestedOwnerId = String(formData.get("ownerId") ?? "").trim() || null;
  const ownerId = resolveAssignableOwnerId(scope, requestedOwnerId);
  if (ownerId && !(await getUserById(ownerId))) {
    throw new Error("INVALID_OWNER");
  }

  await createLead(
    {
      name,
      status: parseStatus(formData.get("status")),
      source: String(formData.get("source") ?? "").trim() || null,
      contactPhone: String(formData.get("contactPhone") ?? "").trim() || null,
      contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
      remark: String(formData.get("remark") ?? "").trim() || null,
      ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
    },
    scope
  );

  revalidatePath("/leads");
  redirect("/leads");
}

export async function updateLeadStatusAction(id: string, formData: FormData) {
  const currentUser = await requireScope();
  const scope = accessScopeFor(currentUser);
  const status = parseStatus(formData.get("status"));
  try {
    await updateLead(id, { status }, scope);
  } catch (error) {
    leadAccessError(error);
  }
  revalidatePath("/leads");
}

export async function deleteLeadAction(id: string) {
  const currentUser = await requireScope();
  const scope = accessScopeFor(currentUser);
  try {
    await deleteLead(id, scope);
  } catch (error) {
    leadAccessError(error);
  }
  revalidatePath("/leads");
}
