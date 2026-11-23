import { prisma } from "@/lib/db/client";
import { getUserByFeishuOpenId } from "@/lib/db/repositories/user";
import type { CurrentUser } from "@/lib/auth/session";
import { UserRole } from "@/generated/prisma/enums";

/**
 * 飞书身份 → CRM 用户的映射。
 *
 * 机器人收到的每个事件都只带 open_id，必须先映射成 `CurrentUser` 才能复用
 * 现有的权限边界（`accessScopeFor`）。映射失败时**不降级、不放行**：
 * 机器人回一张「请先绑定账号」的卡片，业务动作一个都不做。
 *
 * 角色以数据库为准，不信任飞书侧任何角色信息。
 */
export async function resolveCrmUser(
  openId: string
): Promise<CurrentUser | null> {
  if (!openId) return null;
  const user = await getUserByFeishuOpenId(openId);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    role: user.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.OWNER,
  };
}

/**
 * 按姓名或邮箱反查 CRM 用户，供管理员在「未绑定的飞书身份」列表中做绑定。
 *
 * 只做精确匹配，避免把消息错绑到同名的人身上。
 */
export async function findUserForBinding(input: {
  name?: string;
  email?: string;
}) {
  const conditions = [];
  if (input.email) conditions.push({ email: input.email });
  if (input.name) conditions.push({ name: input.name });
  if (conditions.length === 0) return null;
  return prisma.user.findFirst({ where: { OR: conditions } });
}
