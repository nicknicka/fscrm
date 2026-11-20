import type { CurrentUser } from "./session";

/**
 * 业务查询与写入使用的权限范围。
 * 管理员可访问全部线索，普通负责人只能访问本人负责的线索。
 */
export interface AccessScope {
  userId: string;
  role: CurrentUser["role"];
}

/** 由当前会话构造权限范围。 */
export function accessScopeFor(user: CurrentUser): AccessScope {
  return { userId: user.id, role: user.role };
}

/** 普通负责人只匹配本人负责的对象；管理员不加负责人过滤。 */
export function ownerWhere(scope: AccessScope) {
  return scope.role === "ADMIN" ? {} : { ownerId: scope.userId };
}
