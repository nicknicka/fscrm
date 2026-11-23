import { prisma } from "../client";
import type { CurrentUser } from "@/lib/auth/session";
import { BusinessObjectNotFoundError } from "./not-found";

/**
 * 任务与日程服务（#70）。
 * 负责人只能读写自己的任务/日程，管理员不受限（与跟进记录同口径）。
 */

/** 任务列表：按当前用户权限收窄，未完成优先、按计划时间排序。 */
export async function listSalesTasks(user: CurrentUser) {
  return prisma.salesTask.findMany({
    where: user.role === "OWNER" ? { ownerId: user.id } : {},
    include: {
      owner: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true } },
      followUp: { select: { id: true, content: true, nextFollowUpAt: true } },
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });
}

/** 新建任务/日程入参：负责人已在 action 层按权限解析。 */
export interface CreateSalesTaskInput {
  type: "TASK" | "SCHEDULE";
  title: string;
  description: string | null;
  dueAt: Date;
  customerId: string | null;
  opportunityId: string | null;
  /** 来源跟进记录（可选），承接下一步计划时间。 */
  followUpId?: string | null;
}

/** 新建任务/日程：负责人由调用方按权限解析后传入。 */
export async function createSalesTask(
  input: CreateSalesTaskInput,
  resolvedOwnerId: string
) {
  return prisma.salesTask.create({
    data: {
      ...input,
      ownerId: resolvedOwnerId,
    },
  });
}

/** 切换完成状态：带权限条件，越权/不存在统一 NOT_FOUND。 */
export async function setSalesTaskStatus(
  id: string,
  status: "OPEN" | "DONE",
  user: CurrentUser
) {
  const result = await prisma.salesTask.updateMany({
    where: {
      id,
      ...(user.role === "OWNER" ? { ownerId: user.id } : {}),
    },
    data: { status },
  });
  if (result.count === 0)
    throw new BusinessObjectNotFoundError("SalesTaskNotFoundError");
}

/** 删除任务：带权限条件。 */
export async function deleteSalesTask(id: string, user: CurrentUser) {
  const result = await prisma.salesTask.deleteMany({
    where: {
      id,
      ...(user.role === "OWNER" ? { ownerId: user.id } : {}),
    },
  });
  if (result.count === 0)
    throw new BusinessObjectNotFoundError("SalesTaskNotFoundError");
}

/** 扫描逾期未完成的任务（供提醒使用）：按 ownerId 分组返回。 */
export async function listOverdueTasks(now: Date) {
  return prisma.salesTask.findMany({
    where: { status: "OPEN", dueAt: { lt: now } },
    select: {
      id: true,
      title: true,
      dueAt: true,
      ownerId: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: { dueAt: "asc" },
    take: 200,
  });
}
