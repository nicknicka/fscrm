import { prisma } from "../client";
import { UserRole } from "@/generated/prisma/enums";
import { accessScopeFor } from "@/lib/auth/scope";
import type { CurrentUser } from "@/lib/auth/session";
import type { User } from "../../../generated/prisma/client";

/**
 * 用户（普通负责人 / 管理员）数据访问层。
 */

/** 用户任免失败的错误代码，供命令行等调用方稳定识别。 */
export const USER_NOT_FOUND = "USER_NOT_FOUND";
export const LAST_ADMIN = "LAST_ADMIN";
export const INVALID_USER_REF = "INVALID_USER_REF";

/** 可串行化事务的冲突上限：冲突后整笔重做，超限后按 LAST_ADMIN 处理。 */
const REVOKE_MAX_ATTEMPTS = 3;

/**
 * 定位已有用户（普通负责人或管理员）的条件：内部 ID 或飞书 open_id 二选一。
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

class AdminConflictError extends Error {
  constructor(
    message: string,
    readonly retryable = true
  ) {
    super(message);
  }
}

function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === "P2034" ||
    code === "40001" ||
    /could not serialize access|serialization failure|write conflict/i.test(
      error.message
    )
  );
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

function userRefForError(where: { id: string } | { feishuOpenId: string }) {
  const [field, value] = Object.entries(where)[0];
  return { field, value };
}

/** 撤销管理员前做最后一次同一事务内的管理员计数校验。 */
async function countAdmins(tx: {
  user: { count: (args: { where: { role: typeof UserRole.ADMIN } }) => Promise<number> };
}): Promise<number> {
  return tx.user.count({
    where: { role: UserRole.ADMIN },
  });
}

function lastAdminError(): UserAdminError {
  return new UserAdminError(
    LAST_ADMIN,
    "不能撤销最后一个管理员：系统必须至少保留一名管理员"
  );
}

/** 在可串行化事务里把角色写入已存在的用户，不调用 create/upsert。 */
async function setUserAdmin(
  ref: UserRef,
  role: typeof UserRole.ADMIN | typeof UserRole.OWNER
): Promise<User> {
  const where = userWhere(ref);
  const label = userRefForError(where);
  let lastAdminCount = 0;

  for (let attempt = 1; attempt <= REVOKE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.user.findUnique({ where });
          if (!existing) {
            throw new UserAdminError(
              USER_NOT_FOUND,
              `未找到用户（${label.field}=${label.value}），不会创建新用户`
            );
          }

          // 已为目标角色仍需在撤销场景校验管理员底线。
          if (
            existing.role === role &&
            role === UserRole.OWNER &&
            (await countAdmins(tx)) <= 1
          ) {
            throw lastAdminError();
          }
          if (existing.role === role) return existing;

          // 管理员撤销使用条件更新：只有目标仍是管理员时才写入，避免并发任命
          // 与撤销互相覆盖，也避免重复撤销影响其他管理员。
          if (role === UserRole.OWNER) {
            // 撤销前在同一事务内校验管理员底线；若看到变化，交给外层重做事务。
            const beforeCount = await countAdmins(tx);
            if (beforeCount <= 1) {
              throw new AdminConflictError(
                "并发事务已改变管理员总数，需重做事务"
              );
            }

            const result = await tx.user.updateMany({
              where: { id: existing.id, role: UserRole.ADMIN },
              data: { role: UserRole.OWNER },
            });
            if (result.count !== 1) {
              throw new AdminConflictError("管理员角色已被并发修改");
            }
            // 可串行化快照内重新计数：若另一事务已提交最后一次撤销则回滚本次。
            lastAdminCount = await countAdmins(tx);
            if (lastAdminCount <= 1) {
              throw new AdminConflictError(
                "并发事务已改变管理员总数，需重做事务"
              );
            }
          } else {
            const result = await tx.user.updateMany({
              where: { id: existing.id },
              data: { role: UserRole.ADMIN },
            });
            if (result.count !== 1) {
              throw new AdminConflictError("用户已被并发修改");
            }
          }

          return tx.user.update({
            where: { id: existing.id },
            data: { role },
          });
        },
        role === UserRole.OWNER
          ? { isolationLevel: "Serializable" }
          : undefined
      );
    } catch (error) {
      const conflict =
        error instanceof AdminConflictError
          ? error
          : isSerializationConflict(error)
            ? new AdminConflictError("事务因并发冲突回滚")
            : null;
      if (!conflict) throw error;
      if (!conflict.retryable || attempt === REVOKE_MAX_ATTEMPTS) {
        throw new UserAdminError(
          LAST_ADMIN,
          "管理员角色被并发修改，未能确认仍保留管理员；请重试或先任命其他管理员"
        );
      }
    }
  }

  throw new UserAdminError(LAST_ADMIN, "管理员任免未能完成");
}

/** 任命已有普通负责人为管理员（按内部 ID 或飞书 open_id 定位）。 */
export function grantAdmin(ref: UserRef): Promise<User> {
  return setUserAdmin(ref, UserRole.ADMIN);
}

/** 撤销已有管理员的角色，回落到普通负责人；不允许撤销最后一个管理员。 */
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
