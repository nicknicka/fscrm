import { prisma } from "../client";
import { UserRole } from "@/generated/prisma/enums";
import { accessScopeFor } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
import type { User } from "../../../generated/prisma/client";

/**
 * 用户（负责人）数据访问层。
 */

/** 用户任免失败的错误代码，供命令行等调用方稳定识别。 */
export const USER_NOT_FOUND = "USER_NOT_FOUND";
export const LAST_ADMIN = "LAST_ADMIN";
export const INVALID_USER_REF = "INVALID_USER_REF";

/**
 * 定位已有负责人的条件：内部 ID 或飞书 open_id 二选一。
 * 两个字段都传或都不传时抛错，避免误操作到非预期用户。
 */
export interface UserRef {
  id?: string;
  openId?: string;
}

class UserAdminError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = "UserAdminError";
  }
}

/** 把 UserRef 转成 prisma 的 where 条件；不存在的字段一律拒绝。 */
function userWhere(ref: UserRef): { id: string } | { feishuOpenId: string } {
  const hasId = typeof ref.id === "string" && ref.id.trim().length > 0;
  const hasOpenId =
    typeof ref.openId === "string" && ref.openId.trim().length > 0;
  if (hasId === hasOpenId) {
    throw new UserAdminError(
      INVALID_USER_REF,
      "请且仅请提供一个定位条件：用户内部 ID (id) 或飞书 open_id (openId)"
    );
  }
  return hasId ? { id: ref.id!.trim() } : { feishuOpenId: ref.openId!.trim() };
}

/** 在事务里把角色写入已存在的用户，不调用 create/upsert。 */
async function setUserAdmin(
  ref: UserRef,
  role: typeof UserRole.ADMIN | typeof UserRole.OWNER
): Promise<User> {
  const where = userWhere(ref);

  return prisma.$transaction(async (tx) => {
    // 撤销前先核对管理员总数：系统必须始终保留至少一名管理员。
    if (role === UserRole.OWNER) {
      const adminCount = await tx.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new UserAdminError(
          LAST_ADMIN,
          "不能撤销最后一个管理员：系统必须至少保留一名管理员"
        );
      }
    }

    const existing = await tx.user.findUnique({ where });
    if (!existing) {
      throw new UserAdminError(
        USER_NOT_FOUND,
        `未找到用户（${Object.keys(where)[0]}=${Object.values(where)[0]}），不会创建新用户`
      );
    }

    if (existing.role === role) {
      return existing;
    }

    return tx.user.update({
      where: { id: existing.id },
      data: { role },
    });
  });
}

/** 任命已有负责人为管理员（按内部 ID 或飞书 open_id 定位）。 */
export function grantAdmin(ref: UserRef): Promise<User> {
  return setUserAdmin(ref, UserRole.ADMIN);
}

/** 撤销已有负责人的管理员角色，回落到普通负责人；不允许撤销最后一个管理员。 */
export function revokeAdmin(ref: UserRef): Promise<User> {
  return setUserAdmin(ref, UserRole.OWNER);
}

/** 查询用户列表。 */
export async function listUsers(): Promise<User[]> {
  return prisma.user.findMany({
    orderBy: { name: "asc" },
  });
}

/** 查询可分配的负责人：管理员可选全部人，普通负责人只有自己。 */
export async function listAssignableUsers(
  currentUser: CurrentUser
): Promise<Pick<User, "id" | "name">[]> {
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
