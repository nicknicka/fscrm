"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { accessScopeFor, resolveAssignableOwnerId } from "@/lib/auth/scope";
import { auditWrite } from "@/lib/db/repositories/audit-log";
import { BusinessObjectNotFoundError } from "@/lib/db/repositories/not-found";
import { getFollowUp } from "@/lib/db/repositories/sales";
import {
  createSalesTask,
  deleteSalesTask,
  listSalesTasks,
  setSalesTaskStatus,
} from "@/lib/db/repositories/sales-task";

/** 新建任务/日程：负责人与来源跟进按统一权限范围解析。 */
export async function createSalesTaskAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const title = String(formData.get("title") ?? "").trim();
  const rawDueAt = String(formData.get("dueAt") ?? "");
  const type = formData.get("type") === "SCHEDULE" ? "SCHEDULE" : "TASK";
  const customerId = String(formData.get("customerId") ?? "") || null;
  const opportunityId = String(formData.get("opportunityId") ?? "") || null;
  const followUpId = String(formData.get("followUpId") ?? "") || null;
  const followUp = followUpId ? await getFollowUp(followUpId, user) : null;
  // 跟随来源跟进承接客户/商机与下一步计划时间，但表单显式填写的字段优先。
  const resolvedCustomerId = customerId || followUp?.customerId || null;
  const resolvedOpportunityId =
    opportunityId || followUp?.opportunityId || null;
  const dueAt = rawDueAt
    ? new Date(rawDueAt)
    : followUp?.nextFollowUpAt
      ? new Date(followUp.nextFollowUpAt)
      : new Date(Number.NaN);
  if (!title || Number.isNaN(dueAt.getTime())) return;
  if (followUpId && !followUp) return;
  const requestedOwnerId = String(formData.get("ownerId") ?? "") || null;
  const ownerId =
    resolveAssignableOwnerId(accessScopeFor(user), requestedOwnerId) ?? user.id;

  const rawDescription = String(formData.get("description") ?? "").trim();
  const description = followUpId
    ? `来源跟进记录：${followUpId}${rawDescription ? `\n${rawDescription}` : ""}`
    : rawDescription || null;

  const task = await createSalesTask(
    {
      type,
      title,
      description,
      dueAt,
      customerId: resolvedCustomerId,
      opportunityId: resolvedOpportunityId,
      followUpId,
    },
    ownerId
  );
  await auditWrite(user, "CREATE", "SalesTask", task.id, `新建任务：${title}`);
  revalidatePath("/tasks");
  if (resolvedCustomerId) revalidatePath(`/customers/${resolvedCustomerId}`);
  if (resolvedOpportunityId)
    revalidatePath(`/opportunities/${resolvedOpportunityId}`);
}

/** 表单专用：切换完成状态。 */
export async function toggleSalesTaskFormAction(
  id: string,
  status: "OPEN" | "DONE",
  _formData: FormData
) {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await setSalesTaskStatus(id, status, user);
    await auditWrite(
      user,
      "UPDATE",
      "SalesTask",
      id,
      `切换任务状态为 ${status}`
    );
  } catch (error) {
    if (!(error instanceof BusinessObjectNotFoundError)) throw error;
  }
  revalidatePath("/tasks");
}

/** 表单专用：删除任务。 */
export async function deleteSalesTaskFormAction(
  id: string,
  _formData: FormData
) {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await deleteSalesTask(id, user);
    await auditWrite(user, "DELETE", "SalesTask", id, `删除任务 ${id}`);
  } catch (error) {
    if (!(error instanceof BusinessObjectNotFoundError)) throw error;
  }
  revalidatePath("/tasks");
}

/** 读取当前用户可见的任务与日程。 */
export async function listSalesTasksForCurrentUser() {
  const user = await getCurrentUser();
  if (!user) return [];
  return listSalesTasks(user);
}
