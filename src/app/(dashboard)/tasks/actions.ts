"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { BusinessObjectNotFoundError } from "@/lib/db/repositories/not-found";
import {
  createSalesTask,
  deleteSalesTask,
  listSalesTasks,
  setSalesTaskStatus,
} from "@/lib/db/repositories/sales-task";

/** 新建任务/日程；类型与时间由服务端校验，负责人取会话用户。 */
export async function createSalesTaskAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const title = String(formData.get("title") ?? "").trim();
  const rawDueAt = String(formData.get("dueAt") ?? "");
  const dueAt = rawDueAt ? new Date(rawDueAt) : new Date(Number.NaN);
  const type = formData.get("type") === "SCHEDULE" ? "SCHEDULE" : "TASK";
  if (!title || Number.isNaN(dueAt.getTime())) return;
  const customerId = String(formData.get("customerId") ?? "") || null;
  const opportunityId = String(formData.get("opportunityId") ?? "") || null;

  await createSalesTask(
    {
      type,
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      dueAt,
      customerId,
      opportunityId,
    },
    user
  );
  revalidatePath("/tasks");
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
