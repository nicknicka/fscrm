import { prisma } from "../client";
import type { CurrentUser } from "../../auth/session";
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

/** 按 ID 查询用户（含飞书 open_id，用于通知）。 */
export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

/** 按飞书 open_id 查询用户。 */
export async function getUserByFeishuOpenId(openId: string) {
  return prisma.user.findUnique({ where: { feishuOpenId: openId } });
}

/**
 * 按当前负责人角色返回可选择的用户：普通负责人仅本人，管理员可选择全部。
 * 未登录传入 null 时返回空列表，避免任何表单获得负责人选项。
 */
export async function listAssignableUsersForScope(
  scope: CurrentUser | null
): Promise<User[]> {
  if (!scope) {
    return [];
  }
  return prisma.user.findMany({
    where:
      scope.role === "OWNER"
        ? { id: scope.id }
        : // 管理员可以按 ID 指定任意负责人；空对象只限制返回字段，不限制用户范围。
          {},
    orderBy: { name: "asc" },
  });
}
