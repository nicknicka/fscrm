import { prisma } from "../client";
import { accessScopeFor } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
import type { User } from "../../../generated/prisma/client";

/**
 * 用户（负责人）数据访问层。
 */

/** 查询用户列表。 */
export async function listUsers(): Promise<User[]> {
  return prisma.user.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * 查询可分配的负责人：管理员可选全部人，普通负责人只有自己。
 */
export async function listAssignableUsers(currentUser: CurrentUser): Promise<Pick<User, "id" | "name">[]> {
  const scope = accessScopeFor(currentUser);
  return prisma.user.findMany({
    where: scope.role === "ADMIN" ? {} : { id: scope.userId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** 按 ID 查询用户（含飞书 open_id，用于通知）。 */
export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

/** 按飞书 open_id 查询用户。 */
export async function getUserByFeishuOpenId(openId: string) {
  return prisma.user.findUnique({ where: { feishuOpenId: openId } });
}
