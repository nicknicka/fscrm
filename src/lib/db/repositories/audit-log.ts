import { prisma } from "@/lib/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * 业务审计日志服务（#73）。
 * 记录关键写操作的「谁、何时、改了什么」；与飞书集成日志（CardActionLog /
 * FeishuMessageLog）完全独立。查询按权限：管理员全部，负责人仅自己的操作。
 */

/** 写一条审计日志；失败不影响业务操作（调用方用 void 或 catch）。 */
export async function recordAudit(input: {
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}) {
  return prisma.auditLog.create({ data: input });
}

/** 从当前用户构造审计记录的 actor 信息。 */
export function auditActor(user: CurrentUser) {
  return { actorId: user.id, actorName: user.name };
}

/** 便捷埋点：记录一条审计；审计失败被吞掉，绝不影响业务写入。 */
export async function auditWrite(
  user: CurrentUser,
  action: string,
  entityType: string,
  entityId: string,
  summary: string
): Promise<void> {
  try {
    await recordAudit({
      ...auditActor(user),
      action,
      entityType,
      entityId,
      summary,
    });
  } catch (error) {
    console.error("[audit] 写审计日志失败", entityType, entityId, error);
  }
}

/** 查询审计日志：按实体/操作人/摘要过滤，管理员全员、负责人仅自己。 */
export async function listAuditLogs(
  user: CurrentUser,
  filters: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    search?: string;
    limit?: number;
  } = {}
) {
  const where: Prisma.AuditLogWhereInput = {
    ...(user.role === "OWNER" ? { actorId: user.id } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.search
      ? { summary: { contains: filters.search, mode: "insensitive" as const } }
      : {}),
  };
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 200,
  });
}
